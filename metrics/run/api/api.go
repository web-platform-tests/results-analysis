package api

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"time"

	"cloud.google.com/go/bigquery"
	"cloud.google.com/go/datastore"
	gcs "cloud.google.com/go/storage"
	mapset "github.com/deckarep/golang-set"
	flags "github.com/jessevdk/go-flags"
	"github.com/web-platform-tests/results-analysis/metrics"
	"github.com/web-platform-tests/results-analysis/metrics/compute"
	"github.com/web-platform-tests/results-analysis/metrics/storage"
	"github.com/web-platform-tests/wpt.fyi/shared"
	"google.golang.org/api/option"
)

const (
	DefaultShardedInputBucket      = "wptd"
	DefaultConsolidatedInputBucket = "wptd-results"
)

var defaultStagingComputer = metricsComputerData{
	ProjectID:       "wptdashboard-staging",
	InputGCSBucket:  DefaultConsolidatedInputBucket,
	OutputGCSBucket: "wptd-metrics-staging",
	// No BQ config: Output to GCS only.
	WPTDHost:     "staging.wpt.fyi",
	Pretty:       false,
	RateLimitGCS: false,
	ShardedInput: false,
}

var defaultProdComputer = metricsComputerData{
	ProjectID:       "wptdashboard",
	InputGCSBucket:  DefaultConsolidatedInputBucket,
	OutputGCSBucket: "wptd-metrics",
	// No BQ config: Output to GCS only.
	WPTDHost:     "wpt.fyi",
	Pretty:       false,
	RateLimitGCS: false,
	ShardedInput: false,
}

var DefaultStagingComputer = func() MetricsComputer {
	c := defaultStagingComputer
	return &c
}

var DefaultProdComputer = func() MetricsComputer {
	c := defaultProdComputer
	return &c
}

type MetricsComputer interface {
	Compute(ctx context.Context, shortSHA string, labels []string) error
}

type metricsComputerData struct {
	ProjectID                     string `long:"project_id" default:"wptdashboard-staging" description:"Google Cloud Platform project id"`
	InputGCSBucket                string `long:"input_gcs_bucket" description:"Google Cloud Storage bucket from which  test results are fetched"`
	OutputGCSBucket               string `long:"output_gcs_bucket" default:"wptd-metrics-staging" description:"Google Cloud Storage bucket where metrics are stored"`
	OutputBQMetadataDataset       string `long:"output_bq_metadata_dataset" description:"BigQuery dataset where metrics metadata are stored"`
	OutputBQDataDataset           string `long:"output_bq_data_dataset" description:"BigQuery dataset where metrics data are stored"`
	OutputBQPassRateTable         string `long:"output_bq_pass_rate_table" description:"BigQuery table where pass rate metrics are stored"`
	OutputBQPassRateMetadataTable string `long:"output_bq_pass_rate_metadata_table" description:"BigQuery table where pass rate metrics are stored"`
	OutputBQFailuresTable         string `long:"output_bq_failures_table" description:"BigQuery table where test failure lists are stored"`
	OutputBQFailuresMetadataTable string `long:"output_bq_failures_metadata_table" description:"BigQuery table where pass rate metrics are stored"`
	WPTDHost                      string `long:"wptd_host" default:"staging.wpt.fyi" description:"Hostname of endpoint that serves WPT Dashboard data API"`
	GCPCredentialsFile            string `long:"gcp_credentials_file" default:"client-secret.json" description:"Path to Google Cloud Platform file for accessing services"`
	Pretty                        bool   `long:"pretty" description:"Prettify stdout output; appropriate for terminals but not log files"`
	RateLimitGCS                  bool   `long:"rate_limit_gcs" description:"Whether or not to rate limit concurrent requests to Google Cloud Storage"`
	ShardedInput                  bool   `long:"sharded_input" description:"Read input from sharded (rather than consolidated) results files"`
}

func NewMetricsComputerFromArgs(args []string) (MetricsComputer, []string, error) {
	unixNow := time.Now().Unix()

	var mcd metricsComputerData
	rest, err := flags.NewParser(&mcd, flags.IgnoreUnknown).ParseArgs(args)
	if err != nil {
		return nil, nil, err
	}

	if mcd.InputGCSBucket == "" {
		if mcd.ShardedInput {
			mcd.InputGCSBucket = DefaultShardedInputBucket
		} else {
			mcd.InputGCSBucket = DefaultConsolidatedInputBucket
		}
	}

	if mcd.OutputBQMetadataDataset == "" {
		mcd.OutputBQMetadataDataset = fmt.Sprintf("wptd_metrics_%d", unixNow)
	}
	if mcd.OutputBQDataDataset == "" {
		mcd.OutputBQDataDataset = fmt.Sprintf("wptd_metrics_%d", unixNow)
	}
	if mcd.OutputBQPassRateTable == "" {
		mcd.OutputBQPassRateTable = fmt.Sprintf("PassRates_%d", unixNow)
	}
	if mcd.OutputBQPassRateMetadataTable == "" {
		mcd.OutputBQPassRateMetadataTable = fmt.Sprintf("PassRateMetadata_%d", unixNow)
	}
	if mcd.OutputBQFailuresTable == "" {
		mcd.OutputBQFailuresTable = fmt.Sprintf("Failures_%d", unixNow)
	}
	if mcd.OutputBQFailuresMetadataTable == "" {
		mcd.OutputBQFailuresMetadataTable = fmt.Sprintf("FailuresMetadata_%d", unixNow)
	}

	return &mcd, rest, err
}

func (mcd *metricsComputerData) Compute(ctx context.Context, shortSHA string, labels []string) error {
	logger := metrics.GetLogger(ctx)

	var gcsClient *gcs.Client
	var err error

	if mcd.GCPCredentialsFile != "" {
		logger.Infof("Connecting to GCP with credentials from file")
		gcsClient, err = gcs.NewClient(ctx, option.WithCredentialsFile(mcd.GCPCredentialsFile))
	} else {
		logger.Infof("Connecting to GCP without credentials from file")
		gcsClient, err = gcs.NewClient(ctx)
	}
	if err != nil {
		return err
	}

	inputBucket := gcsClient.Bucket(mcd.InputGCSBucket)
	ctxF := storage.NewConsolidatedGCSDatastoreContext
	if mcd.ShardedInput {
		ctxF = storage.NewShardedGCSDatastoreContext
	}
	inputCtx := ctxF(ctx, storage.Bucket{
		Name:   mcd.InputGCSBucket,
		Handle: inputBucket,
	}, nil)

	labelSet := mapset.NewSet()
	for _, label := range labels {
		labelSet.Add(label)
	}

	alignment := true
	filters := shared.TestRunFilter{
		SHAs:   shared.SHAs{shortSHA},
		Labels: labelSet,
		// Set Aligned to ensure that, if SHA and Labels are zero-valued, the filter
		// isn't interpreted as zero-valued and filled out with default data, such
		// as labels that should not be applied.
		Aligned: &alignment,
	}
	runsWithLabels, err := shared.FetchRuns(mcd.WPTDHost, filters)
	if err != nil {
		return err
	}

	var datastoreClient *datastore.Client
	if mcd.GCPCredentialsFile != "" {
		logger.Infof("Connecting to Datastore with credentials from file")
		datastoreClient, err = datastore.NewClient(ctx, mcd.ProjectID, option.WithCredentialsFile(mcd.GCPCredentialsFile))
	} else {
		logger.Infof("Connecting to Datastore without credentials from file")
		datastoreClient, err = datastore.NewClient(ctx, mcd.ProjectID)
	}
	if err != nil {
		return err
	}

	prm := metrics.GetDatastoreKindName(metrics.PassRateMetadata{})
	runsWithLabelsIDs := runsWithLabels.GetTestRunIDs()

	logger.Infof("Checking whether interop data already exists for runs %v", runsWithLabelsIDs)

	q := datastore.NewQuery(prm).Limit(1).KeysOnly()
	for _, id := range runsWithLabelsIDs {
		q = q.Filter("TestRunIDs =", id)
	}
	keys, err := datastoreClient.GetAll(ctx, q, nil)
	if err != nil {
		return err
	}
	if len(keys) > 0 {
		logger.Warningf("Found interop metadata for runs; skipping interop compute+store")
		return nil
	}

	logger.Infof("Reading test results from Google Cloud Storage bucket: %s", mcd.InputGCSBucket)

	readStartTime := time.Now()
	runs, err := metrics.ConvertRuns(runsWithLabels)
	if err != nil {
		return err
	}

	var limiter storage.Limiter
	if mcd.RateLimitGCS {
		limiter = storage.GCSLimiter()
	}
	allResults, err := inputCtx.LoadTestRunResults(runs, limiter, mcd.Pretty)
	readEndTime := time.Now()

	logger.Infof("Read test results from Google Cloud Storage bucket: %s", mcd.InputGCSBucket)

	if err != nil {
		return err
	}

	logger.Infof("Consolidating results")

	resultsByID := compute.GatherResultsById(ctx, &allResults)

	logger.Infof("Consolidated results")
	logger.Infof("Computing metrics")

	var totals map[string]int
	var passRateMetric map[string][]int
	failuresMetrics := make(map[string][][]metrics.TestID)
	var wg sync.WaitGroup
	wg.Add(2 + len(runs))
	go func() {
		defer wg.Done()
		totals = compute.ComputeTotals(&resultsByID)
	}()
	go func() {
		defer wg.Done()
		passRateMetric = compute.ComputePassRateMetric(len(runs),
			&resultsByID, compute.OkOrPassesAndUnknownOrPasses)
	}()
	for _, run := range runs {
		go func(browserName string) {
			defer wg.Done()
			// TODO: Check that browser names are different.
			failuresMetrics[browserName] =
				compute.ComputeBrowserFailureList(len(runs),
					browserName, &resultsByID,
					compute.OkOrPassesAndUnknownOrPasses)
		}(run.BrowserName)
	}
	wg.Wait()

	logger.Infof("Computed metrics")
	logger.Infof("Uploading metrics")

	var outputBucket *gcs.BucketHandle
	if mcd.OutputGCSBucket != "" {
		outputBucket = gcsClient.Bucket(mcd.OutputGCSBucket)
	}

	var bigqueryClient *bigquery.Client
	if mcd.GCPCredentialsFile != "" {
		logger.Infof("Connecting to BigQuery with credentials from file")
		bigqueryClient, err = bigquery.NewClient(ctx, mcd.ProjectID, option.WithCredentialsFile(mcd.GCPCredentialsFile))
	} else {
		logger.Infof("Connecting to BigQuery without credentials from file")
		bigqueryClient, err = bigquery.NewClient(ctx, mcd.ProjectID)
	}
	if err != nil {
		return err
	}
	outputters := [2]storage.Outputter{
		storage.NewShardedGCSDatastoreContext(ctx, storage.Bucket{
			Name:   mcd.OutputGCSBucket,
			Handle: outputBucket,
		}, datastoreClient),
		storage.BQContext{
			Context: ctx,
			Client:  bigqueryClient,
		},
	}

	gcsDir := fmt.Sprintf("%d-%d", readStartTime.Unix(),
		readEndTime.Unix())
	passRatesBasename := "pass-rates"
	passRateGCSPath := fmt.Sprintf("%s/%s.json.gz", gcsDir,
		passRatesBasename)
	passRatesURL := fmt.Sprintf(
		"https://storage.googleapis.com/%s/%s",
		mcd.OutputGCSBucket,
		passRateGCSPath)
	failuresBasenamef := func(browserName string) string {
		return fmt.Sprintf("%s-failures", browserName)
	}
	failuresGCSPathf := func(browserName string) string {
		return fmt.Sprintf("%s/%s.json.gz", gcsDir,
			failuresBasenamef(browserName))
	}
	failuresUrlf := func(browserName string) string {
		return fmt.Sprintf(
			"https://storage.googleapis.com/%s/%s",
			mcd.OutputGCSBucket,
			failuresGCSPathf(browserName))
	}
	passRateMetadata := metrics.PassRateMetadata{
		TestRunsMetadata: metrics.TestRunsMetadata{
			StartTime:  readStartTime,
			EndTime:    readEndTime,
			TestRunIDs: runsWithLabels.GetTestRunIDs(),
			DataURL:    passRatesURL,
		},
	}

	wg.Add((1 + len(failuresMetrics)) * len(outputters))
	processUploadErrors := func(errs []error) error {
		if errs == nil {
			return nil
		}

		for _, err := range errs {
			logger.Errorf("Upload error: %v", err)
		}
		if len(errs) > 0 {
			return errs[len(errs)-1]
		}

		return nil
	}
	for _, outputter := range outputters {
		go func(outputter storage.Outputter) {
			defer wg.Done()
			outputID := storage.OutputId{
				MetadataLocation: storage.OutputLocation{
					BQDatasetName: mcd.OutputBQMetadataDataset,
					BQTableName:   mcd.OutputBQPassRateMetadataTable,
				},
				DataLocation: storage.OutputLocation{
					GCSObjectPath: passRateGCSPath,
					BQDatasetName: mcd.OutputBQDataDataset,
					BQTableName:   mcd.OutputBQPassRateTable,
				},
			}
			_, _, errs := uploadTotalsAndPassRateMetric(&passRateMetadata, outputter, outputID, totals, passRateMetric)
			err = processUploadErrors(errs)
		}(outputter)
		for browserName, failuresMetric := range failuresMetrics {
			go func(browserName string, failuresMetric [][]metrics.TestID, outputter storage.Outputter) {
				defer wg.Done()
				failuresMetadata := metrics.FailuresMetadata{
					TestRunsMetadata: metrics.TestRunsMetadata{
						StartTime:  readStartTime,
						EndTime:    readEndTime,
						TestRunIDs: runsWithLabels.GetTestRunIDs(),
						DataURL:    failuresUrlf(browserName),
					},
					BrowserName: browserName,
				}
				outputID := storage.OutputId{
					MetadataLocation: storage.OutputLocation{
						BQDatasetName: mcd.OutputBQMetadataDataset,
						BQTableName:   mcd.OutputBQFailuresMetadataTable,
					},
					DataLocation: storage.OutputLocation{
						GCSObjectPath: gcsDir +
							"/" +
							failuresBasenamef(browserName) +
							".json.gz",
						BQDatasetName: mcd.OutputBQDataDataset,
						BQTableName:   mcd.OutputBQFailuresTable,
					},
				}
				_, _, errs := uploadFailureLists(&failuresMetadata,
					outputter, outputID, browserName,
					failuresMetric)
				err = processUploadErrors(errs)
			}(browserName, failuresMetric, outputter)
		}
	}
	wg.Wait()

	logger.Infof("Uploaded metrics")

	return err
}

type FailureListsRow struct {
	BrowserName      string         `json:"browser_name"`
	NumOtherFailures int            `json:"num_other_failures"`
	Tests            metrics.TestID `json:"test"`
}
type ByTestId []interface{}

func (s ByTestId) Len() int          { return len(s) }
func (s ByTestId) Swap(i int, j int) { s[i], s[j] = s[j], s[i] }
func (s ByTestId) Less(i int, j int) bool {
	return s[i].(FailureListsRow).Tests.Test < s[j].(FailureListsRow).Tests.Test
}

func failureListsToRows(browserName string, failureLists [][]metrics.TestID) (
	rows []interface{}) {
	numRows := 0
	for _, failureList := range failureLists {
		numRows += len(failureList)
	}
	rows = make([]interface{}, 0, numRows)
	for i, failuresPtrList := range failureLists {
		for _, failure := range failuresPtrList {
			rows = append(rows, FailureListsRow{
				browserName,
				i,
				failure,
			})
		}
	}
	sort.Sort(ByTestId(rows))
	return rows
}

type PassRateMetricRow struct {
	Dir       string `json:"dir"`
	PassRates []int  `json:"pass_rates"`
	Total     int    `json:"total"`
}
type ByDir []interface{}

func (s ByDir) Len() int          { return len(s) }
func (s ByDir) Swap(i int, j int) { s[i], s[j] = s[j], s[i] }
func (s ByDir) Less(i int, j int) bool {
	return s[i].(PassRateMetricRow).Dir < s[j].(PassRateMetricRow).Dir
}

func totalsAndPassRateMetricToRows(totals map[string]int,
	passRateMetric map[string][]int) (
	rows []interface{}) {

	rows = make([]interface{}, 0, len(passRateMetric))
	for dir, passRates := range passRateMetric {
		rows = append(rows, PassRateMetricRow{dir, passRates,
			totals[dir]})
	}
	sort.Sort(ByDir(rows))
	return rows
}

func uploadTotalsAndPassRateMetric(metricsRun *metrics.PassRateMetadata,
	outputter storage.Outputter, id storage.OutputId,
	totals map[string]int, passRateMetric map[string][]int) (
	interface{}, []interface{}, []error) {
	rows := totalsAndPassRateMetricToRows(totals, passRateMetric)
	return outputter.Output(id, metricsRun, rows)
}

func uploadFailureLists(metricsRun *metrics.FailuresMetadata,
	outputter storage.Outputter, id storage.OutputId,
	browserName string, failureLists [][]metrics.TestID) (
	interface{}, []interface{}, []error) {
	rows := failureListsToRows(browserName, failureLists)
	return outputter.Output(id, metricsRun, rows)
}

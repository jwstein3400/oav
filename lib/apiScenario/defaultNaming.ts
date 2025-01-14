export const defaultQualityReportFilePath = (newmanReportFilePath: string): string => {
  return newmanReportFilePath.replace(".json", "/report.json");
};

export const defaultCollectionFileName = (testScenarioFileName: string, runId: string) => {
  return `${testScenarioFileName}/${runId}/collection.json`;
};

export const defaultEnvFileName = (testScenarioFileName: string, runId: string) => {
  return `${testScenarioFileName}/${runId}/env.json`;
};

export const defaultNewmanReport = (
  testScenarioFileName: string,
  runId: string,
  testScenarioName: string
) => {
  return `${testScenarioFileName}/${runId}/${testScenarioName}.json`;
};

export const defaultNewmanDir = (testScenarioFileName: string, runId: string) => {
  return `${testScenarioFileName}/${runId}`;
};

export const getFileNameFromPath = (filePath: string): string => {
  return filePath.replace(/^.*[\\\/]/, "").replace(".yaml", "");
};

export const blobNameDatePostfix = (name: string) => {
  return `${name}_${new Date().toISOString().slice(0, 10)}`;
};

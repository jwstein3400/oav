import * as fs from "fs";
import * as path from "path";
import * as Mustache from "mustache";
import {
  OperationCoverageInfo,
  TrafficValidationIssue,
  TrafficValidationOptions,
} from "../swaggerValidator/trafficValidator";
import { LiveValidationIssue } from "../liveValidation/liveValidator";
import { FileLoader } from "../swagger/fileLoader";
import { checkAndResolveGithubUrl } from "../util/utils";
import { OperationContext } from "../liveValidation/operationValidator";

export interface TrafficValidationIssueForRendering extends TrafficValidationIssue {
  payloadFileLinkLabel?: string;
  errorsForRendering?: LiveValidationIssueForRendering[];
  errorCodeLen: number;
}

export interface TrafficValidationIssueForRenderingInner {
  generalErrorsInner: TrafficValidationIssueForRendering[];
  errorCodeLen: number;
  operationInfo: OperationContext;
  errorsForRendering: LiveValidationIssueForRendering[];
}

export interface LiveValidationIssueForRendering extends LiveValidationIssue {
  friendlyName?: string;
  link?: string;
  payloadFilePath?: string | undefined;
  payloadFileLinkLabel?: string | undefined;
}

export interface ErrorDefinitionDoc {
  ErrorDefinitions: ErrorDefinition[];
}

export interface ErrorDefinition {
  code: string;
  friendlyName?: string;
  link?: string;
}

export interface OperationCoverageInfoForRendering extends OperationCoverageInfo {
  specLinkLabel?: string;
  validationPassOperations?: number;
}

// used to pass data to the template rendering engine
export class CoverageView {
  public package: string;
  public language: string;
  public apiVersion: string = "unknown";
  public generatedDate: Date;

  public undefinedOperationCount: number = 0;
  public operationValidated: number = 0;
  public operationFailed: number = 0;
  public operationUnValidated: number = 0;
  public generalErrorResults: Map<string, TrafficValidationIssue[]>;

  public validationResultsForRendering: TrafficValidationIssueForRendering[] = [];
  public coverageResultsForRendering: OperationCoverageInfoForRendering[] = [];

  private validationResults: TrafficValidationIssue[];
  private sortedValidationResults: TrafficValidationIssue[];
  private coverageResults: OperationCoverageInfo[];

  private specLinkPrefix: string;
  private payloadLinkPrefix: string;
  private overrideLinkInReport: boolean;
  private outputExceptionInReport: boolean;

  public constructor(
    validationResults: TrafficValidationIssue[],
    coverageResults: OperationCoverageInfo[],
    undefinedOperationCount: number = 0,
    packageName: string = "",
    language: string = "",
    overrideLinkInReport: boolean = false,
    outputExceptionInReport: boolean = false,
    specLinkPrefix: string = "",
    payloadLinkPrefix: string = ""
  ) {
    this.package = packageName;
    this.validationResults = validationResults;
    this.coverageResults = coverageResults;
    this.undefinedOperationCount = undefinedOperationCount;
    this.generatedDate = new Date();
    this.generalErrorResults = new Map();
    this.language = language;
    this.overrideLinkInReport = overrideLinkInReport;
    this.outputExceptionInReport = outputExceptionInReport;
    this.specLinkPrefix = specLinkPrefix;
    this.payloadLinkPrefix = payloadLinkPrefix;

    if (this.overrideLinkInReport === true) {
      if (this.specLinkPrefix.endsWith("/")) {
        this.specLinkPrefix = this.specLinkPrefix.substring(0, this.specLinkPrefix.length - 1);
      }

      if (this.payloadLinkPrefix.endsWith("/")) {
        this.payloadLinkPrefix = this.payloadLinkPrefix.substring(
          0,
          this.payloadLinkPrefix.length - 1
        );
      }
    }

    this.setMetrics();
    this.sortOperationIds();
  }

  public async prepareDataForRendering() {
    try {
      const errorDefinitions = await this.loadErrorDefinitions();
      let errorsForRendering: LiveValidationIssueForRendering[];
      this.sortedValidationResults.forEach((element) => {
        const payloadFile = element.payloadFilePath?.substring(
          element.payloadFilePath.lastIndexOf("/") + 1
        );
        errorsForRendering = [];
        element.errors?.forEach((error) => {
          const errorDef = errorDefinitions.get(error.code);
          errorsForRendering.push({
            friendlyName: errorDef?.friendlyName,
            link: errorDef?.link,
            code: error.code,
            message: error.message,
            schemaPath: error.schemaPath,
            pathsInPayload: error.pathsInPayload,
            jsonPathsInPayload: error.jsonPathsInPayload,
            severity: error.severity,
            source: error.source,
            params: error.params,
            payloadFilePath: this.overrideLinkInReport
              ? `${this.payloadLinkPrefix}/${payloadFile}`
              : element.payloadFilePath,
            payloadFileLinkLabel: payloadFile,
          });
        });
        this.validationResultsForRendering.push({
          payloadFilePath: this.overrideLinkInReport
            ? `${this.payloadLinkPrefix}/${payloadFile}`
            : element.payloadFilePath,
          payloadFileLinkLabel: payloadFile,
          errors: element.errors,
          errorsForRendering: errorsForRendering,
          errorCodeLen: errorsForRendering.length,
          operationInfo: element.operationInfo,
          runtimeExceptions: element.runtimeExceptions,
        });
      });
      this.coverageResults.forEach((element) => {
        const specLink = this.overrideLinkInReport
          ? `${this.specLinkPrefix}/${element.spec?.substring(
              element.spec?.indexOf("specification")
            )}`
          : element.spec;
        this.coverageResultsForRendering.push({
          spec: specLink,
          specLinkLabel: element.spec?.substring(element.spec?.lastIndexOf("/") + 1),
          apiVersion: element.apiVersion,
          coveredOperaions: element.coveredOperaions,
          validationPassOperations: element.coveredOperaions - element.validationFailOperations,
          validationFailOperations: element.validationFailOperations,
          unCoveredOperations: element.unCoveredOperations,
          unCoveredOperationsList: element.unCoveredOperationsList,
          unCoveredOperationsListGen: element.unCoveredOperationsListGen,
          totalOperations: element.totalOperations,
          coverageRate: element.coverageRate,
        });
      });
    } catch (e) {
      console.error(`Failed in prepareDataForRendering with err:${e?.stack};message:${e?.message}`);
    }
  }

  private async loadErrorDefinitions(): Promise<Map<string, ErrorDefinition>> {
    const loader = new FileLoader({});
    const errorDefinitionsDoc =
      "https://github.com/Azure/oav/blob/develop/documentation/error-definitions.json";
    const fileString = await loader.load(checkAndResolveGithubUrl(errorDefinitionsDoc));
    const errorDefinitionDoc = JSON.parse(fileString) as ErrorDefinitionDoc;
    const errorsMap: Map<string, ErrorDefinition> = new Map();
    errorDefinitionDoc.ErrorDefinitions.forEach((def) => {
      errorsMap.set(def.code, def);
    });
    return errorsMap;
  }

  private sortOperationIds() {
    this.sortedValidationResults = this.validationResults.sort(function (op1, op2) {
      const opId1 = op1.operationInfo!.operationId;
      const opId2 = op2.operationInfo!.operationId;
      if (opId1 < opId2) {
        return -1;
      }
      if (opId1 > opId2) {
        return 1;
      }
      return 0;
    });
  }
  private setMetrics() {
    if (this.coverageResults?.length > 0) {
      this.apiVersion = this.coverageResults[0].apiVersion;
    }
  }

  public formatGeneratedDate(): string {
    const day = this.generatedDate.getDate();
    const month = this.generatedDate.getMonth() + 1;
    const year = this.generatedDate.getFullYear();
    const hours = this.generatedDate.getHours();
    const minutes = this.generatedDate.getMinutes();

    return (
      year +
      "-" +
      (month < 10 ? "0" + month : month) +
      "-" +
      (day < 10 ? "0" + day : day) +
      " at " +
      hours +
      ":" +
      (minutes < 10 ? "0" + minutes : minutes) +
      (hours < 13 ? "AM" : "PM")
    );
  }

  public getTotalErrors(): number {
    return this.validationResults.length;
  }

  public getGeneralErrors(): TrafficValidationIssueForRendering[] {
    return this.validationResultsForRendering.filter((x) => {
      return x.errors && x.errors.length > 0;
    });
  }

  public getGeneralErrorsGen(): TrafficValidationIssueForRenderingInner[] {
    const generalErrorsInnerOrigin = this.getGeneralErrors();
    const generalErrorsInnerFormat: TrafficValidationIssueForRendering[][] = Object.values(
      generalErrorsInnerOrigin.reduce(
        (res: { [key: string]: TrafficValidationIssueForRendering[] }, item) => {
          /* eslint-disable no-unused-expressions */
          res[item!.operationInfo!.operationId]
            ? res[item!.operationInfo!.operationId].push(item)
            : (res[item!.operationInfo!.operationId] = [item]);
          /* eslint-enable no-unused-expressions */
          return res;
        },
        {}
      )
    );
    const generalErrorsInnerList: TrafficValidationIssueForRenderingInner[] = [];
    generalErrorsInnerFormat.forEach((element) => {
      let errorCodeLen: number = 0;
      element.forEach((item) => {
        errorCodeLen = errorCodeLen + item.errorCodeLen;
      });
      let errorsForRendering: LiveValidationIssueForRendering[] = [];
      element.forEach((item) => {
        errorsForRendering = errorsForRendering.concat(item.errorsForRendering!);
      });
      generalErrorsInnerList.push({
        generalErrorsInner: element,
        errorCodeLen: errorCodeLen,
        errorsForRendering: errorsForRendering,
        operationInfo: element[0]!.operationInfo!,
      });
    });
    return generalErrorsInnerList;
  }

  public getTotalGeneralErrors(): number {
    return this.getGeneralErrors().length;
  }

  public getRunTimeErrors(): TrafficValidationIssue[] {
    if (this.outputExceptionInReport) {
      return this.validationResults.filter((x) => {
        return x.runtimeExceptions && x.runtimeExceptions.length > 0;
      });
    } else {
      return [];
    }
  }

  public getTotalRunTimeErrors(): number {
    return this.getRunTimeErrors().length;
  }
}

export class ReportGenerator {
  private sdkPackage: string;
  private sdkLanguage: string;
  private validationResults: TrafficValidationIssue[];
  private coverageResults: OperationCoverageInfo[];
  private undefinedOperationsCount: number;
  private reportPath: string;
  private overrideLinkInReport: boolean;
  private outputExceptionInReport: boolean;
  private specLinkPrefix: string;
  private payloadLinkPrefix: string;

  public constructor(
    validationResults: TrafficValidationIssue[],
    coverageResults: OperationCoverageInfo[],
    undefinedOperationResults: number,
    options: TrafficValidationOptions
  ) {
    this.validationResults = validationResults;
    this.coverageResults = coverageResults;
    this.undefinedOperationsCount = undefinedOperationResults;
    this.reportPath = path.resolve(process.cwd(), options.reportPath!);
    this.sdkLanguage = options.sdkLanguage!;
    this.sdkPackage = options.sdkPackage!;
    this.overrideLinkInReport = options.overrideLinkInReport!;
    this.outputExceptionInReport = options.outputExceptionInReport!;
    this.specLinkPrefix = options.specLinkPrefix!;
    this.payloadLinkPrefix = options.payloadLinkPrefix!;
  }

  public async generateHtmlReport() {
    const templatePath = path.resolve(process.cwd(), "dist/lib/templates/baseLayout.mustache");
    const template = fs.readFileSync(templatePath, "utf-8");
    const view = new CoverageView(
      this.validationResults,
      this.coverageResults,
      this.undefinedOperationsCount,
      this.sdkPackage,
      this.sdkLanguage,
      this.overrideLinkInReport,
      this.outputExceptionInReport,
      this.specLinkPrefix,
      this.payloadLinkPrefix
    );
    await view.prepareDataForRendering();

    const general_errors = view.getGeneralErrors();
    const runtime_errors = view.getRunTimeErrors();
    const general_errors_gen = view.getGeneralErrorsGen();

    console.log(general_errors);
    console.log(runtime_errors);
    console.log(general_errors_gen);

    const text = Mustache.render(template, view);
    fs.writeFileSync(this.reportPath, text, "utf-8");
  }
}
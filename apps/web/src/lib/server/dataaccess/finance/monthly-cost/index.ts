import { confirmMonthlyCost } from './confirm'
import { listExportBaseLines } from './export-data'
import {
  getMonthlyCostBundle,
  listAllBaseLines,
  listBaseLineFilterOptions,
  listBaseLines,
  listMonthlyCostProjectBaseLines,
  listMonthlyCostRunIssues,
  listMonthlyCostUsageMonths,
} from './read'
import { runMonthlyCost } from './run'
import {
  deleteDeptContributionWeight,
  listDeptContributionWeights,
  saveDeptContributionWeights,
} from './dept-weights'

export const monthlyCostDataAccess = {
  run: runMonthlyCost,
  confirm: confirmMonthlyCost,
  getBundle: getMonthlyCostBundle,
  listBaseLines,
  listAllBaseLines,
  listBaseLineFilterOptions,
  listExportBaseLines,
  listRunIssues: listMonthlyCostRunIssues,
  listProjectBaseLines: listMonthlyCostProjectBaseLines,
  listUsageMonths: listMonthlyCostUsageMonths,
  listDeptWeights: listDeptContributionWeights,
  saveDeptWeights: saveDeptContributionWeights,
  deleteDeptWeight: deleteDeptContributionWeight,
}

export {
  runMonthlyCost,
  confirmMonthlyCost,
  getMonthlyCostBundle,
  listBaseLines,
  listAllBaseLines,
  listBaseLineFilterOptions,
  listExportBaseLines,
  listMonthlyCostRunIssues,
  listMonthlyCostProjectBaseLines,
  listMonthlyCostUsageMonths,
  listDeptContributionWeights,
  saveDeptContributionWeights,
  deleteDeptContributionWeight,
}

import { platformPricingDbDataAccess } from './db'
import { datacenterSellPriceDataAccess } from './sell-price'

export const platformPricingDataAccess = {
  getListPage: () => platformPricingDbDataAccess.getListPage(),
  getDetailPage: (cardTypeId: string) => platformPricingDbDataAccess.getDetailPage(cardTypeId),
  listRecords: () => platformPricingDbDataAccess.listRecords(),
  listRecordsForCardType: (cardTypeId: string) =>
    platformPricingDbDataAccess.listRecordsForCardType(cardTypeId),
  listHistory: (cardTypeId: string) => platformPricingDbDataAccess.listHistory(cardTypeId),
  createPrice: platformPricingDbDataAccess.createPrice.bind(platformPricingDbDataAccess),
  updatePrice: platformPricingDbDataAccess.updatePrice.bind(platformPricingDbDataAccess),
  createPeriod: platformPricingDbDataAccess.createPeriod.bind(platformPricingDbDataAccess),
  updatePeriod: platformPricingDbDataAccess.updatePeriod.bind(platformPricingDbDataAccess),
  listSellPricesForCardType: (cardTypeId: string) =>
    datacenterSellPriceDataAccess.listForCardType(cardTypeId),
  listSellPriceHistory: (cardTypeId: string, dataCenterId?: string) =>
    datacenterSellPriceDataAccess.listHistory(cardTypeId, dataCenterId),
  createDatacenterSellPrice: datacenterSellPriceDataAccess.create.bind(
    datacenterSellPriceDataAccess,
  ),
  updateDatacenterSellPrice: datacenterSellPriceDataAccess.update.bind(
    datacenterSellPriceDataAccess,
  ),
}

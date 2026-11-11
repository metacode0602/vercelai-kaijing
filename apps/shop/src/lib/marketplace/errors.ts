export class ShopBindingConflictError extends Error {
  constructor(message = '该平台店铺已绑定到其他租户，请联系平台运营处理') {
    super(message)
    this.name = 'ShopBindingConflictError'
  }
}

export class ShopIdentityUnavailableError extends Error {
  constructor(message = '无法识别平台店铺身份，已拒绝保存授权，请重试') {
    super(message)
    this.name = 'ShopIdentityUnavailableError'
  }
}

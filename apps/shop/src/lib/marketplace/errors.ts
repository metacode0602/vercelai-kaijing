export class ShopBindingConflictError extends Error {
  constructor(message = '该平台店铺已绑定到其他租户，请联系平台运营处理') {
    super(message)
    this.name = 'ShopBindingConflictError'
  }
}

import { AsyncLocalStorage } from 'async_hooks';
import { config } from '../config';

type TenantStore = {
  tenantId: number;
};

const tenantStorage = new AsyncLocalStorage<TenantStore>();

export const runWithTenantContext = <T>(tenantId: number, callback: () => T): T => {
  return tenantStorage.run({ tenantId }, callback);
};

export const getCurrentTenantId = (): number => {
  const store = tenantStorage.getStore();
  if (store?.tenantId && Number.isInteger(store.tenantId) && store.tenantId > 0) {
    return store.tenantId;
  }

  return config.tenancy.defaultTenantId;
};

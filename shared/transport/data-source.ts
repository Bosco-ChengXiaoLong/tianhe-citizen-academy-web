/** Vite build-time setting. Legacy `demo` remains an alias of `mock`. Invalid values fail closed. */
export function dataSource(value?: string): 'mock' | 'api' {
  if (!value || value === 'mock' || value === 'demo') return 'mock';
  if (value === 'api') return 'api';
  throw new Error('VITE_DATA_SOURCE must be mock or api');
}

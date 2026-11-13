/** 复制后台演示数据，隔离表单编辑与原始记录。 */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

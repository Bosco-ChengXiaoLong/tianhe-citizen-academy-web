/** 选择当前构建使用的 API 或演示数据源。 */
import { dataSource } from "../../shared/transport/data-source";
export const source = dataSource(import.meta.env.VITE_DATA_SOURCE);
export const isApi = source === "api";

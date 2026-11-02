import { dataSource } from "../../shared/transport/data-source";
export const source = dataSource(import.meta.env.VITE_DATA_SOURCE);
export const isApi = source === "api";

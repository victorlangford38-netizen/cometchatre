import { createHandler } from "../server/http";
export default createHandler(process.env as Record<string, string>);

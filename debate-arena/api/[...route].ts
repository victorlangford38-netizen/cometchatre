import { createHandler } from "../server/http.js";
export default createHandler(process.env as Record<string, string>);

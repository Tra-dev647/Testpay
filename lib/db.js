import { neon } from "@neondatabase/serverless";
export const sql = (...args) => neon(process.env.DATABASE_URL)(...args);

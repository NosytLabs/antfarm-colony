#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { startDashboard } from "./dashboard.js";
import { resolveAntfarmRoot } from "../installer/paths.js";
import { resolveDashboardPort } from "./config.js";

const port = resolveDashboardPort(process.argv[2] ? Number(process.argv[2]) : undefined);

const pidDir = resolveAntfarmRoot();
const pidFile = path.join(pidDir, "dashboard.pid");

fs.mkdirSync(pidDir, { recursive: true });
const runtimeFile=path.join(pidDir,'dashboard.runtime.json');

process.on("SIGTERM", () => {
  try { fs.unlinkSync(pidFile); } catch {}
  try { fs.unlinkSync(runtimeFile); } catch {}
  process.exit(0);
});

const server=startDashboard(port);
server.once('listening',()=>{
  const address=server.address();
  if(address && typeof address!=='string'){
    fs.writeFileSync(runtimeFile,JSON.stringify({pid:process.pid,port:address.port})+'\n',{mode:0o600});
    fs.writeFileSync(pidFile,String(process.pid),{mode:0o600});
  }
});
server.once('error',(error)=>{console.error(error.message);process.exit(1);});

'use strict';
/** Turns the raw Synology status into a short report with plain-language warnings. Never includes serial numbers. */
const USED_WARN_PERCENT = 85;
const DISK_TEMP_WARN = 55;
const OK = new Set(['normal', 'background']);

const gb = (v) => Math.round((Number(v) || 0) / 1e9);

function summarize({ system, storage, backups, upgrade }) {
  const warnings = [];
  const volumes = (storage.volumes || []).map((v) => {
    const total = Number(v.size?.total) || 0; const used = Number(v.size?.used) || 0;
    const usedPercent = total ? Math.round((used / total) * 100) : null;
    if (!OK.has(v.status)) warnings.push(`Volume ${v.id}: Status ${v.status}`);
    if (usedPercent >= USED_WARN_PERCENT) warnings.push(`Volume ${v.id} ist zu ${usedPercent} % voll`);
    return { id: v.id, status: v.status, totalGb: gb(total), usedGb: gb(used), usedPercent };
  });
  const pools = (storage.storagePools || []).map((p) => {
    if (!OK.has(p.status)) warnings.push(`Speicherpool ${p.id}: Status ${p.status}`);
    return { id: p.id, status: p.status, type: p.device_type };
  });
  const disks = (storage.disks || []).map((d) => {
    if (!OK.has(d.status) || !OK.has(d.smart_status)) warnings.push(`Festplatte ${d.id}: Status ${d.status}, SMART ${d.smart_status}`);
    if (d.temp >= DISK_TEMP_WARN) warnings.push(`Festplatte ${d.id} ist ${d.temp} °C warm`);
    return { id: d.id, status: d.status, smart: d.smart_status, tempC: d.temp };
  });
  if (system.sys_tempwarn) warnings.push(`Gerät meldet Übertemperatur (${system.sys_temp} °C)`);
  if (backups && !backups.total) warnings.push('Kein Hyper-Backup-Auftrag eingerichtet');
  return {
    model: system.model, firmware: system.firmware_ver, tempC: system.sys_temp, upHours: Number(String(system.up_time).split(':')[0]) || null,
    volumes, pools, disks,
    backupTasks: backups ? backups.total : null,
    update: upgrade ? { available: !!upgrade.available, version: upgrade.available ? upgrade.version : null } : null,
    warnings,
  };
}

module.exports = { summarize };

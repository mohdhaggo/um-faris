import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { safeParse, DEFAULT_FIELD_CONFIG } from '../constants';

const SettingsCtx = createContext(null);
export const useSettings = () => useContext(SettingsCtx);

export function SettingsProvider({ children }) {
  const [raw, setRaw] = useState(null);

  const reload = () => api.get('/api/settings').then(setRaw).catch(() => {});
  useEffect(() => {
    reload();
  }, []);

  const value = useMemo(() => {
    const jobTypes = safeParse(raw?.job_types, ['صبابة', 'عاملة', 'سائق']);
    const fieldConfig = raw ? safeParse(raw.field_config, DEFAULT_FIELD_CONFIG) : DEFAULT_FIELD_CONFIG;
    const dayOverrides = safeParse(raw?.day_overrides, {});
    const maxPerDay = parseInt(raw?.max_bookings_per_day || '0', 10) || 0;
    return { raw, jobTypes, fieldConfig, dayOverrides, maxPerDay, reload };
  }, [raw]);

  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

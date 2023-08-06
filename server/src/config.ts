import {EufySecurity, Station, EufySecurityConfig} from "eufy-security-client";


export const eufySecurityConfig: EufySecurityConfig = {
    username: '<eufy cloud user name, typically your email address>',
    password: '<eufy cloud password>',
    country: 'nz', // Consider changing this to your respective country code
    language: 'en', // Consider chaning this to your respective preferred country
    persistentDir: '',
    eventDurationSeconds: 5,
    p2pConnectionSetup: 0,
    pollingIntervalMinutes: 0.5,
    acceptInvitations: false,
};


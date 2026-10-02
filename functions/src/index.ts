import * as admin from 'firebase-admin';

admin.initializeApp();

export * from './payment.functions';
export * from './notifications.functions';
export * from './client.functions';
export * from './product.functions';
export * from './cleanup.functions';
export * from './test-email.functions';
export * from './role.functions';
export * from './staff.functions';
export * from './superadmin.functions';
export * from './seo.functions';

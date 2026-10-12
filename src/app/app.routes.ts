import type { Routes } from '@angular/router';
import { AdminGuard } from '@core/guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./features/shop/shop.routes').then((m) => m.SHOP_ROUTES),
  },
  {
    path: 'shop',
    loadChildren: () => import('./features/shop/shop.routes').then((m) => m.SHOP_ROUTES),
  },
  {
    path: 'admin',
    children: [
      {
        path: 'login',
        loadComponent: () => import('./features/admin/components/login/login').then((m) => m.Login),
      },
      {
        path: '',
        canActivate: [AdminGuard],
        loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
      },
    ],
  },
  {
    path: 'mantenimiento',
    title: 'Tienda en actualización',
    loadComponent: () =>
      import('./core/components/deploying-state/deploying-state').then((m) => m.DeployingState),
  },
  {
    path: '**',
    loadComponent: () => import('./features/shared/not-found/not-found').then((m) => m.NotFound),
  },
];

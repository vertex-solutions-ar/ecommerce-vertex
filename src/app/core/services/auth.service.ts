import { computed, inject, Injectable, Injector, runInInjectionContext } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import type { User, UserCredential } from '@angular/fire/auth';
import {
  Auth,
  signOut,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
} from '@angular/fire/auth';
import type { Observable } from 'rxjs';
import { from, of } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import { user } from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { SweetAlertService } from './sweet-alert.service';
import { resolveTenantId } from '@core/utils/tenant';

/** Platform developer emails that always get admin access regardless of tenant claims. */
const PLATFORM_DEV_EMAILS = [
  'juan.l.espeche@gmail.com',
  'leivalihue@gmail.com',
  'vertex.tech.dev@gmail.com',
];

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private router = inject(Router);
  private functions = inject(Functions);
  private sweetAlertService = inject(SweetAlertService);
  private injector = inject(Injector);
  private refreshMyAdminClaim = httpsCallable(this.functions, 'refreshMyAdminClaim');
  private syncUserRoleClaims = httpsCallable(this.functions, 'syncUserRoleClaims');

  currentUser$ = user(this.auth);

  /** True solo para super admins de la plataforma (Juan, Lihue, Vertex o claims globales). */
  isSuperAdmin$: Observable<boolean> = this.currentUser$.pipe(
    switchMap((currentUser) => {
      if (!currentUser) {
        return of(false);
      }
      return from(currentUser.getIdTokenResult());
    }),
    map((tokenResult) => {
      const claims =
        tokenResult && typeof tokenResult === 'object' && tokenResult.claims
          ? (tokenResult.claims as Record<string, unknown>)
          : {};
      const email = String(claims['email'] ?? '').toLowerCase();
      return (
        claims['superAdmin'] === true ||
        claims['platformAdmin'] === true ||
        PLATFORM_DEV_EMAILS.includes(email)
      );
    }),
  );

  isAdmin$: Observable<boolean> = this.currentUser$.pipe(
    switchMap((currentUser) => {
      if (!currentUser) {
        return of(false);
      }
      return from(currentUser.getIdTokenResult());
    }),
    map((tokenResult) => {
      if (tokenResult && typeof tokenResult === 'object') {
        const email = ((tokenResult.claims['email'] as string) || '').toLowerCase();
        const claimedTenantId = tokenResult.claims['tenantId'] as string | undefined;
        const currentTenant = resolveTenantId();
        const isSuper =
          tokenResult.claims['superAdmin'] === true ||
          tokenResult.claims['platformAdmin'] === true ||
          PLATFORM_DEV_EMAILS.includes(email);
        if (isSuper) {
          return true;
        }
        return (
          tokenResult.claims['admin'] === true &&
          (!claimedTenantId || claimedTenantId === currentTenant)
        );
      }
      return false;
    }),
  );

  userRole$: Observable<'owner' | 'admin' | 'staff' | null> = this.currentUser$.pipe(
    switchMap((currentUser) => {
      if (!currentUser) {
        return of(null);
      }
      return from(currentUser.getIdTokenResult());
    }),
    map((tokenResult) => {
      if (tokenResult && typeof tokenResult === 'object') {
        const email = ((tokenResult.claims['email'] as string) || '').toLowerCase();
        if (
          tokenResult.claims['superAdmin'] === true ||
          tokenResult.claims['platformAdmin'] === true ||
          PLATFORM_DEV_EMAILS.includes(email)
        ) {
          return 'owner';
        }
        const role = String(tokenResult.claims['role'] ?? '').toLowerCase();
        if (role === 'owner' || role === 'admin' || role === 'staff') {
          return role as 'owner' | 'admin' | 'staff';
        }
      }
      return null;
    }),
  );

  readonly userRole = toSignal(this.userRole$, { initialValue: null });
  readonly isStaff = computed(() => this.userRole() === 'staff');

  isStaff$: Observable<boolean> = this.userRole$.pipe(map((role) => role === 'staff'));

  isOwner$: Observable<boolean> = this.currentUser$.pipe(
    switchMap((currentUser) => {
      if (!currentUser) {
        return of(false);
      }
      return from(currentUser.getIdTokenResult());
    }),
    map((tokenResult) => {
      if (tokenResult && typeof tokenResult === 'object') {
        return tokenResult.claims['role'] === 'owner';
      }
      return false;
    }),
  );

  loginWithGoogle(): Observable<UserCredential> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    return from(
      (async (): Promise<UserCredential> => {
        try {
          const result = await runInInjectionContext(this.injector, () =>
            signInWithPopup(this.auth, provider),
          );

          // Force refresh the token to grab custom claims.
          let tokenResult = await result.user.getIdTokenResult(true);
          let claimedTenantId = tokenResult.claims['tenantId'] as string | undefined;
          const email = ((tokenResult.claims['email'] as string) || '').toLowerCase();
          const isSuper =
            tokenResult.claims['superAdmin'] === true ||
            tokenResult.claims['platformAdmin'] === true ||
            PLATFORM_DEV_EMAILS.includes(email);

          const currentTenant = resolveTenantId();

          if (!isSuper && (!tokenResult.claims['admin'] || claimedTenantId !== currentTenant)) {
            // Attempt to sync the claim synchronously via callable.
            // This handles the race where onRoleChange fired before the user existed in Auth,
            // or if the user is logging into a new tenant.
            let granted = false;
            try {
              const res = (await this.syncUserRoleClaims({ tenantId: currentTenant })) as {
                data?: { granted?: boolean };
              };
              granted = !!res?.data?.granted;
            } catch {
              try {
                const res = (await this.refreshMyAdminClaim({ tenantId: currentTenant })) as {
                  data?: { granted?: boolean };
                };
                granted = !!res?.data?.granted;
              } catch {
                granted = false;
              }
            }

            if (granted) {
              // Custom claims were set by server — force token refresh with getIdToken(true)
              await result.user.getIdToken(true);
              for (let i = 0; i < 3; i++) {
                await new Promise((resolve) => setTimeout(resolve, 800));
                tokenResult = await result.user.getIdTokenResult(true);
                claimedTenantId = tokenResult.claims['tenantId'] as string | undefined;
                if (tokenResult.claims['admin'] && claimedTenantId === currentTenant) {
                  break;
                }
              }
            } else {
              // User is definitely NOT authorized for this store — sign out immediately.
              await signOut(this.auth);
              throw new Error('permission-denied');
            }
          }

          if (!isSuper && !tokenResult.claims['admin']) {
            await signOut(this.auth);
            throw new Error('permission-denied');
          }

          if (!isSuper && claimedTenantId && claimedTenantId !== currentTenant) {
            await signOut(this.auth);
            throw new Error('wrong-tenant');
          }

          return result;
        } catch (err: unknown) {
          const rawCode =
            err && typeof err === 'object' && 'code' in err
              ? String((err as { code?: string }).code)
              : '';
          const msg = err instanceof Error ? err.message : String(err);
          const code = rawCode || msg;

          if (
            code.includes('auth/popup-blocked') ||
            code.includes('auth/popup-closed-by-user') ||
            code.includes('auth/unauthorized-domain') ||
            code.includes('auth/redirect-uri-mismatch') ||
            code.includes('redirect_uri_mismatch')
          ) {
            throw new Error(code);
          }

          if (code.includes('auth/invalid-continue-uri')) {
            console.warn(
              '[Google Login]: Popup auth failed with invalid-continue-uri. Falling back to signInWithRedirect...',
            );
            await runInInjectionContext(this.injector, () =>
              signInWithRedirect(this.auth, provider),
            );
            return {} as UserCredential;
          }

          throw err;
        }
      })(),
    );
  }

  async silentLogout(): Promise<void> {
    try {
      await signOut(this.auth);
    } catch (err) {
      console.error('Error during silent logout:', err);
    }
  }

  async logout(options?: { title?: string; text?: string }): Promise<void> {
    try {
      await signOut(this.auth);

      const title = options?.title ?? 'Sesión Cerrada';
      const text = options?.text ?? 'Has sido redirigido a la página de inicio de sesión.';

      this.sweetAlertService.success(title, text);
      void this.router.navigate(['/admin/login']);
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
      this.sweetAlertService.error(
        'Error',
        'No se pudo cerrar la sesión. Por favor, inténtalo de nuevo.',
      );
      throw err;
    }
  }

  isAuthenticated(): Observable<boolean> {
    return this.currentUser$.pipe(map((currentUser) => !!currentUser));
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<boolean> {
    const currentUser: User | null = this.auth.currentUser;

    if (!currentUser?.email) {
      throw new Error('No hay usuario autenticado o el email no está disponible.');
    }

    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      return true;
    } catch (error) {
      console.error('Error en el proceso de cambio de contraseña:', error);
      throw error;
    }
  }
}

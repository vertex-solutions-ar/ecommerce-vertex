import type { OnInit, OnDestroy } from '@angular/core';
import { Component, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { take } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  authErrorMessage = '';
  isAlreadyLogged = false;
  isGoogleSubmitting = false;

  private loginTimeoutId: ReturnType<typeof setTimeout> | null = null;
  /** Máximo tiempo de espera para el flujo de login (ms). */
  private readonly LOGIN_TIMEOUT_MS = 10_000;

  ngOnInit(): void {
    this.authService.currentUser$.pipe(take(1)).subscribe((currentUser) => {
      if (!currentUser) {
        this.isAlreadyLogged = false;
        return;
      }
      this.authService.isAdmin$.pipe(take(1)).subscribe((isAdmin) => {
        if (isAdmin) {
          this.isAlreadyLogged = true;
          void this.router.navigate(['/admin']);
        } else {
          // El usuario está autenticado en Firebase Auth pero no tiene permisos en esta tienda.
          // Limpiamos la sesión silenciosamente para no bloquear reintentos ni generar loops.
          this.isAlreadyLogged = false;
          void this.authService.silentLogout().then(() => {
            this.authErrorMessage =
              'Tu cuenta de Google no está autorizada para acceder a esta tienda. Solicita acceso al administrador.';
          });
        }
      });
    });

    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      if (params['authError']) {
        this.authErrorMessage = 'Debes iniciar sesión para acceder al panel de administración.';
      }
      // El guard redirige acá con ?unauthorized=1 cuando el usuario autenticado no tiene permisos.
      if (params['unauthorized']) {
        this._resetSubmitting();
        this.isAlreadyLogged = false;
        void this.authService.silentLogout();
        this.authErrorMessage =
          'Tu cuenta de Google no está autorizada para acceder a esta tienda. Solicita acceso al administrador.';
      }
    });
  }

  ngOnDestroy(): void {
    this._clearLoginTimeout();
  }

  private _clearLoginTimeout(): void {
    if (this.loginTimeoutId !== null) {
      clearTimeout(this.loginTimeoutId);
      this.loginTimeoutId = null;
    }
  }

  private _resetSubmitting(): void {
    this._clearLoginTimeout();
    this.isGoogleSubmitting = false;
  }

  onGoogleLogin(): void {
    this.isGoogleSubmitting = true;
    this.authErrorMessage = '';

    // Safety net: si el flujo de login no resuelve en LOGIN_TIMEOUT_MS (e.g. redirect fallback
    // o cuelgue de red), mostrar error y habilitar el botón nuevamente.
    this._clearLoginTimeout();
    this.loginTimeoutId = setTimeout(() => {
      if (this.isGoogleSubmitting) {
        this._resetSubmitting();
        this.authErrorMessage =
          'El inicio de sesión tardó demasiado. Verificá tu conexión e intentá de nuevo.';
      }
    }, this.LOGIN_TIMEOUT_MS);

    this.authService
      .loginWithGoogle()
      .pipe(take(1))
      .subscribe({
        next: () => {
          // Resetear siempre el estado al completar (sea exitoso o no).
          // Si el usuario no tenía permisos, AuthService hace signOut() y lanza error,
          // pero como fallback extra reseteamos acá también por si algún edge case pasa por next.
          this._resetSubmitting();
          void this.router.navigate(['/admin']);
        },
        error: (err: unknown) => {
          console.error('[Google Login Error]:', err);
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('permission-denied') || msg.includes('unauthorized')) {
            this.authErrorMessage =
              'Tu cuenta de Google no está autorizada para acceder a esta tienda. Solicita acceso al administrador.';
          } else if (msg.includes('auth/unauthorized-domain')) {
            this.authErrorMessage =
              'Este dominio no está autorizado para Google OAuth en Firebase Auth de esta tienda. Agregalo en Authentication > Settings > Authorized domains e intentá de nuevo.';
          } else if (msg.includes('auth/operation-not-allowed')) {
            this.authErrorMessage =
              'El inicio de sesión con Google no está habilitado en este proyecto. Habilítalo en Firebase Auth > Sign-in method.';
          } else if (msg.includes('auth/invalid-continue-uri')) {
            this.authErrorMessage =
              'La URL de continuación no es válida para esta tienda. Verifica la configuración de Firebase Auth.';
          } else if (msg.includes('auth/popup-blocked')) {
            this.authErrorMessage =
              'El navegador bloqueó la ventana emergente de Google. Permitila e intentá de nuevo.';
          } else if (msg.includes('auth/popup-closed-by-user')) {
            this.authErrorMessage =
              'La ventana de inicio de sesión de Google se cerró antes de completar el acceso. Si ocurrió un error 400 (redirect_uri_mismatch), verifica las URIs de redirección OAuth autorizadas.';
          } else if (
            msg.includes('auth/redirect-uri-mismatch') ||
            msg.includes('redirect_uri_mismatch')
          ) {
            this.authErrorMessage =
              'Error 400: redirect_uri_mismatch. La URI de redirección de esta tienda no está autorizada en Google Cloud OAuth.';
          } else if (msg.includes('wrong-tenant')) {
            this.authErrorMessage =
              'Tu cuenta pertenece a otra tienda. Ingresá a la URL correcta o solicitá acceso.';
          } else {
            this.authErrorMessage = `No se pudo iniciar sesión con Google. Error: ${msg}`;
          }
          this._resetSubmitting();
        },
      });
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    this.isAlreadyLogged = false;
  }
}

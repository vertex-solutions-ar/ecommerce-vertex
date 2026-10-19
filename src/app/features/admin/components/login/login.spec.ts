import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import type { User, UserCredential } from '@angular/fire/auth';
import { of, throwError, Subject } from 'rxjs';
import { Login } from './login';
import { AuthService } from '@core/services/auth.service';

describe('Login', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    spyOn(console, 'error');
    spyOn(console, 'warn');
    authServiceSpy = jasmine.createSpyObj<AuthService>(
      'AuthService',
      ['loginWithGoogle', 'logout', 'silentLogout', 'isAuthenticated'],
      {
        currentUser$: of(null),
        isAdmin$: of(false),
      },
    );
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    authServiceSpy.isAuthenticated.and.returnValue(of(false));
    authServiceSpy.silentLogout.and.returnValue(Promise.resolve());
    routerSpy.navigate.and.returnValue(Promise.resolve(true));

    await TestBed.configureTestingModule({
      imports: [Login, ReactiveFormsModule],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: { queryParams: of({}) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call loginWithGoogle when Google login is requested', () => {
    authServiceSpy.loginWithGoogle.and.returnValue(of({} as UserCredential));

    component.onGoogleLogin();

    expect(authServiceSpy.loginWithGoogle).toHaveBeenCalled();
  });

  it('should navigate to /admin after successful Google login', () => {
    authServiceSpy.loginWithGoogle.and.returnValue(of({} as UserCredential));

    component.onGoogleLogin();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/admin']);
  });

  it('should set authErrorMessage when Google login fails', () => {
    authServiceSpy.loginWithGoogle.and.returnValue(
      throwError(() => new Error('auth/unauthorized-domain')),
    );

    component.onGoogleLogin();

    expect(component.authErrorMessage).toBeTruthy();
    expect(component.isGoogleSubmitting).toBeFalse();
  });

  it('should detect authError query param and set error message', () => {
    // Re-create component with authError param
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Login, ReactiveFormsModule],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: { queryParams: of({ authError: '1' }) },
        },
      ],
    });

    const f2 = TestBed.createComponent(Login);
    f2.detectChanges();

    expect(f2.componentInstance.authErrorMessage).toBeTruthy();
  });

  it('should set isAlreadyLogged to true and navigate when user is already an authorized admin', () => {
    Object.defineProperty(authServiceSpy, 'currentUser$', {
      value: of({ email: 'admin@test.com' } as unknown as User),
      configurable: true,
    });
    Object.defineProperty(authServiceSpy, 'isAdmin$', {
      value: of(true),
      configurable: true,
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Login, ReactiveFormsModule],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
        { provide: ActivatedRoute, useValue: { queryParams: of({}) } },
      ],
    });

    const f3 = TestBed.createComponent(Login);
    f3.detectChanges();

    expect(f3.componentInstance.isAlreadyLogged).toBeTrue();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/admin']);
  });

  it('should silently logout and show error if user is authenticated in Firebase Auth but NOT an admin of this store', async () => {
    Object.defineProperty(authServiceSpy, 'currentUser$', {
      value: of({ email: 'unauthorized@test.com' } as unknown as User),
      configurable: true,
    });
    Object.defineProperty(authServiceSpy, 'isAdmin$', {
      value: of(false),
      configurable: true,
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Login, ReactiveFormsModule],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
        { provide: ActivatedRoute, useValue: { queryParams: of({}) } },
      ],
    });

    const fUnauthorized = TestBed.createComponent(Login);
    fUnauthorized.detectChanges();
    await fUnauthorized.whenStable();

    expect(authServiceSpy.silentLogout).toHaveBeenCalled();
    expect(fUnauthorized.componentInstance.isAlreadyLogged).toBeFalse();
    expect(fUnauthorized.componentInstance.authErrorMessage).toContain('no está autorizada');
  });

  it('should set permission-denied error message on unauthorized error', () => {
    authServiceSpy.loginWithGoogle.and.returnValue(
      throwError(() => new Error('permission-denied')),
    );

    component.onGoogleLogin();

    expect(component.authErrorMessage).toContain('no está autorizada');
    expect(component.isGoogleSubmitting).toBeFalse();
  });

  it('should set popup-blocked error message when popup is blocked', () => {
    authServiceSpy.loginWithGoogle.and.returnValue(
      throwError(() => new Error('auth/popup-blocked')),
    );

    component.onGoogleLogin();

    expect(component.authErrorMessage).toContain('bloqueó');
    expect(component.isGoogleSubmitting).toBeFalse();
  });

  it('should set generic error message for unknown errors', () => {
    authServiceSpy.loginWithGoogle.and.returnValue(
      throwError(() => new Error('some-unknown-error')),
    );

    component.onGoogleLogin();

    expect(component.authErrorMessage).toBe(
      'No se pudo iniciar sesión con Google. Error: some-unknown-error',
    );
    expect(component.isGoogleSubmitting).toBeFalse();
  });

  it('should set wrong-tenant error message', () => {
    authServiceSpy.loginWithGoogle.and.returnValue(throwError(() => new Error('wrong-tenant')));

    component.onGoogleLogin();

    expect(component.authErrorMessage).toContain('pertenece a otra tienda');
    expect(component.isGoogleSubmitting).toBeFalse();
  });

  it('should handle non-Error error objects', () => {
    authServiceSpy.loginWithGoogle.and.returnValue(throwError(() => 'string-error-message'));

    component.onGoogleLogin();

    expect(component.authErrorMessage).toContain('No se pudo iniciar sesión');
    expect(component.authErrorMessage).toContain('string-error-message');
    expect(component.isGoogleSubmitting).toBeFalse();
  });

  it('should set operation-not-allowed error message', () => {
    authServiceSpy.loginWithGoogle.and.returnValue(
      throwError(() => new Error('auth/operation-not-allowed')),
    );

    component.onGoogleLogin();

    expect(component.authErrorMessage).toContain('no está habilitado en este proyecto');
    expect(component.isGoogleSubmitting).toBeFalse();
  });

  it('should set invalid-continue-uri error message', () => {
    authServiceSpy.loginWithGoogle.and.returnValue(
      throwError(() => new Error('auth/invalid-continue-uri')),
    );

    component.onGoogleLogin();

    expect(component.authErrorMessage).toContain('continuación no es válida');
    expect(component.isGoogleSubmitting).toBeFalse();
  });

  it('should set popup-closed-by-user error message', () => {
    authServiceSpy.loginWithGoogle.and.returnValue(
      throwError(() => new Error('auth/popup-closed-by-user')),
    );

    component.onGoogleLogin();

    expect(component.authErrorMessage).toContain('ventana de inicio de sesión');
    expect(component.isGoogleSubmitting).toBeFalse();
  });

  it('should set redirect-uri-mismatch error message', () => {
    authServiceSpy.loginWithGoogle.and.returnValue(
      throwError(() => new Error('auth/redirect-uri-mismatch')),
    );

    component.onGoogleLogin();

    expect(component.authErrorMessage).toContain('redirect_uri_mismatch');
    expect(component.isGoogleSubmitting).toBeFalse();
  });

  it('logout() should set isAlreadyLogged to false', async () => {
    authServiceSpy.logout = jasmine.createSpy('logout').and.returnValue(Promise.resolve());
    component.isAlreadyLogged = true;

    await component.logout();

    expect(component.isAlreadyLogged).toBeFalse();
  });

  it('should set error message for auth/wrong-password error', () => {
    authServiceSpy.loginWithGoogle.and.returnValue(
      throwError(() => new Error('auth/wrong-password')),
    );

    component.onGoogleLogin();

    expect(component.authErrorMessage).toContain('auth/wrong-password');
    expect(component.isGoogleSubmitting).toBeFalse();
  });

  it('should set error message for auth/user-not-found error', () => {
    authServiceSpy.loginWithGoogle.and.returnValue(
      throwError(() => new Error('auth/user-not-found')),
    );

    component.onGoogleLogin();

    expect(component.authErrorMessage).toContain('auth/user-not-found');
    expect(component.isGoogleSubmitting).toBeFalse();
  });

  it('should set error message when error contains redirect_uri_mismatch without auth/ prefix', () => {
    authServiceSpy.loginWithGoogle.and.returnValue(
      throwError(() => new Error('redirect_uri_mismatch')),
    );

    component.onGoogleLogin();

    expect(component.authErrorMessage).toContain('redirect_uri_mismatch');
    expect(component.isGoogleSubmitting).toBeFalse();
  });

  it('should set isGoogleSubmitting to true while google login is pending', () => {
    const loginSubject = new Subject<UserCredential>();
    authServiceSpy.loginWithGoogle.and.returnValue(loginSubject.asObservable());

    component.onGoogleLogin();

    expect(component.isGoogleSubmitting).toBeTrue();

    loginSubject.next({} as UserCredential);
    loginSubject.complete();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/admin']);
  });

  it('should trigger logout when clicking logout link in template', () => {
    TestBed.resetTestingModule();
    Object.defineProperty(authServiceSpy, 'currentUser$', {
      value: of({ email: 'admin@test.com' } as unknown as User),
      configurable: true,
    });
    Object.defineProperty(authServiceSpy, 'isAdmin$', {
      value: of(true),
      configurable: true,
    });

    TestBed.configureTestingModule({
      imports: [Login, ReactiveFormsModule],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
        { provide: ActivatedRoute, useValue: { queryParams: of({}) } },
      ],
    });

    const fLogout = TestBed.createComponent(Login);
    fLogout.componentInstance.isAlreadyLogged = true;
    fLogout.detectChanges();

    authServiceSpy.logout = jasmine.createSpy('logout').and.returnValue(Promise.resolve());
    const logoutLink = fLogout.nativeElement.querySelector('.alert-info a') as HTMLAnchorElement;
    expect(logoutLink).toBeTruthy();

    logoutLink.click();
    expect(authServiceSpy.logout).toHaveBeenCalled();
  });
});

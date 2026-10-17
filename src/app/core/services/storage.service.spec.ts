import { TestBed } from '@angular/core/testing';
import { StorageService } from './storage.service';
import { Storage } from '@angular/fire/storage';
import { SweetAlertService } from './sweet-alert.service';
import type { StorageReference, UploadTask, UploadTaskSnapshot } from 'firebase/storage';

interface StorageServiceWithPrivates {
  getStorageRef: (path: string) => StorageReference;
  uploadBytes: (storageRef: StorageReference, file: File) => UploadTask;
  getDownloadUrl: (taskRef: StorageReference) => Promise<string>;
  deleteStorageObject: (storageRef: StorageReference) => Promise<void>;
  convertHeicBlob: (file: File) => Promise<Blob | Blob[]>;
}

describe('StorageService', () => {
  let service: StorageService;
  let storageSpy: jasmine.SpyObj<Storage>;
  let sweetAlertSpy: jasmine.SpyObj<SweetAlertService>;

  beforeEach(() => {
    storageSpy = jasmine.createSpyObj('Storage', ['type']);
    sweetAlertSpy = jasmine.createSpyObj('SweetAlertService', ['error']);

    TestBed.configureTestingModule({
      providers: [
        StorageService,
        { provide: Storage, useValue: storageSpy },
        { provide: SweetAlertService, useValue: sweetAlertSpy },
      ],
    });

    service = TestBed.inject(StorageService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should upload file and return progress and download url', (done) => {
    const mockFile = new File(['foo'], 'foo.txt', { type: 'text/plain' });
    const mockRef = {} as unknown as StorageReference;
    const mockUploadTask = {
      on: jasmine
        .createSpy('on')
        .and.callFake(
          (
            _event: string,
            next: (snapshot: UploadTaskSnapshot) => void,
            _error: (err: unknown) => void,
            complete: () => void,
          ): (() => void) => {
            next({ bytesTransferred: 50, totalBytes: 100 } as unknown as UploadTaskSnapshot);
            next({ bytesTransferred: 100, totalBytes: 100 } as unknown as UploadTaskSnapshot);
            complete();
            return (): void => {};
          },
        ),
      then: jasmine
        .createSpy('then')
        .and.callFake(
          (resolve: (snapshot: { ref: StorageReference }) => Promise<unknown> | void) => {
            void resolve({ ref: mockRef });
            return Promise.resolve({ ref: mockRef } as unknown as UploadTaskSnapshot);
          },
        ),
    } as unknown as UploadTask;

    const privSvc = service as unknown as StorageServiceWithPrivates;
    spyOn(privSvc, 'getStorageRef').and.returnValue(mockRef);
    spyOn(privSvc, 'uploadBytes').and.returnValue(mockUploadTask);
    spyOn(privSvc, 'getDownloadUrl').and.returnValue(Promise.resolve('https://mock.url/foo.txt'));

    const upload = service.uploadFile(mockFile, 'test-path');

    let lastProgress = 0;
    upload.progress$.subscribe({
      next: (prog) => {
        lastProgress = prog;
      },
      complete: () => {
        expect(lastProgress).toBe(100);
      },
    });

    upload.downloadUrl$.subscribe({
      next: (url) => {
        expect(url).toBe('https://mock.url/foo.txt');
        done();
      },
    });
  });

  it('should handle invalid URLs in deleteFileByUrl', (done) => {
    service.deleteFileByUrl('invalid-url').subscribe(() => {
      expect(true).toBeTrue();
      done();
    });
  });

  it('should handle file name without extension', (done) => {
    const mockFile = new File(['foo'], 'foofile', { type: 'text/plain' });
    const mockRef = {} as unknown as StorageReference;
    const mockUploadTask = {
      on: jasmine
        .createSpy('on')
        .and.callFake(
          (
            _event: string,
            next: (snapshot: UploadTaskSnapshot) => void,
            _error: (err: unknown) => void,
            complete: () => void,
          ): (() => void) => {
            next({ bytesTransferred: 100, totalBytes: 100 } as unknown as UploadTaskSnapshot);
            complete();
            return (): void => {};
          },
        ),
      then: jasmine
        .createSpy('then')
        .and.callFake(
          (resolve: (snapshot: { ref: StorageReference }) => Promise<unknown> | void) => {
            void resolve({ ref: mockRef });
            return Promise.resolve({ ref: mockRef } as unknown as UploadTaskSnapshot);
          },
        ),
    } as unknown as UploadTask;

    const privSvc = service as unknown as StorageServiceWithPrivates;
    spyOn(privSvc, 'getStorageRef').and.returnValue(mockRef);
    spyOn(privSvc, 'uploadBytes').and.returnValue(mockUploadTask);
    spyOn(privSvc, 'getDownloadUrl').and.returnValue(Promise.resolve('https://mock.url/foofile'));

    const upload = service.uploadFile(mockFile, 'test-path');

    upload.downloadUrl$.subscribe({
      next: (url) => {
        expect(url).toBe('https://mock.url/foofile');
        done();
      },
    });
  });

  it('should handle non-firebase URLs in deleteFileByUrl', (done) => {
    service.deleteFileByUrl('https://example.com/foo.png').subscribe(() => {
      expect(true).toBeTrue();
      done();
    });
  });

  it('should delete file by URL successfully', (done) => {
    const mockRef = {} as unknown as StorageReference;
    const privSvc = service as unknown as StorageServiceWithPrivates;
    spyOn(privSvc, 'getStorageRef').and.returnValue(mockRef);
    spyOn(privSvc, 'deleteStorageObject').and.returnValue(Promise.resolve());

    service
      .deleteFileByUrl('https://firebasestorage.googleapis.com/v0/b/bucket/o/foo.png')
      .subscribe(() => {
        expect(privSvc.deleteStorageObject).toHaveBeenCalledWith(mockRef);
        done();
      });
  });

  it('should handle not found error gracefully on deleteFileByUrl', (done) => {
    spyOn(console, 'warn');
    const mockRef = {} as unknown as StorageReference;
    const privSvc = service as unknown as StorageServiceWithPrivates;
    spyOn(privSvc, 'getStorageRef').and.returnValue(mockRef);
    spyOn(privSvc, 'deleteStorageObject').and.returnValue(
      Promise.reject({ code: 'storage/object-not-found' }),
    );

    service
      .deleteFileByUrl('https://firebasestorage.googleapis.com/v0/b/bucket/o/foo.png')
      .subscribe(() => {
        expect(true).toBeTrue();
        done();
      });
  });

  it('should handle delete error and trigger sweet alert error', (done) => {
    spyOn(console, 'error');
    const mockRef = {} as unknown as StorageReference;
    const privSvc = service as unknown as StorageServiceWithPrivates;
    spyOn(privSvc, 'getStorageRef').and.returnValue(mockRef);
    spyOn(privSvc, 'deleteStorageObject').and.returnValue(
      Promise.reject({ code: 'storage/unknown' }),
    );

    service
      .deleteFileByUrl('https://firebasestorage.googleapis.com/v0/b/bucket/o/foo.png')
      .subscribe({
        error: (_err) => {
          expect(sweetAlertSpy.error).toHaveBeenCalled();
          done();
        },
      });
  });

  describe('HEIC/HEIF double shielding and conversion (prepareUploadFile)', () => {
    it('should return original file untouched if not HEIC/HEIF', async () => {
      const file = new File(['content'], 'avatar.png', { type: 'image/png' });
      const privSvc = service as unknown as StorageServiceWithPrivates;
      spyOn(privSvc, 'convertHeicBlob');

      const result = await service.prepareUploadFile(file);

      expect(result).toBe(file);
      expect(privSvc.convertHeicBlob).not.toHaveBeenCalled();
    });

    it('Guard Clause: should normalize extension to .jpg without invoking heic2any when .heic has image/jpeg MIME type', async () => {
      const file = new File(['jpeg-bytes'], 'photo.heic', { type: 'image/jpeg' });
      const privSvc = service as unknown as StorageServiceWithPrivates;
      spyOn(privSvc, 'convertHeicBlob');

      const onStatusSpy = jasmine.createSpy('onStatus');
      const result = await service.prepareUploadFile(file, onStatusSpy);

      expect(privSvc.convertHeicBlob).not.toHaveBeenCalled();
      expect(onStatusSpy).not.toHaveBeenCalled();
      expect(result.name).toBe('photo.jpg');
      expect(result.type).toBe('image/jpeg');
    });

    it('Guard Clause: should normalize extension to .png without invoking heic2any when .heif has image/png MIME type', async () => {
      const file = new File(['png-bytes'], 'banner.HEIF', { type: 'image/png' });
      const privSvc = service as unknown as StorageServiceWithPrivates;
      spyOn(privSvc, 'convertHeicBlob');

      const result = await service.prepareUploadFile(file);

      expect(privSvc.convertHeicBlob).not.toHaveBeenCalled();
      expect(result.name).toBe('banner.png');
      expect(result.type).toBe('image/png');
    });

    it('Guard Clause: should normalize extension to .webp without invoking heic2any when .heic has image/webp MIME type', async () => {
      const file = new File(['webp-bytes'], 'hero.heic', { type: 'image/webp' });
      const privSvc = service as unknown as StorageServiceWithPrivates;
      spyOn(privSvc, 'convertHeicBlob');

      const result = await service.prepareUploadFile(file);

      expect(privSvc.convertHeicBlob).not.toHaveBeenCalled();
      expect(result.name).toBe('hero.webp');
      expect(result.type).toBe('image/webp');
    });

    it('should convert HEIC to WebP using convertHeicBlob when MIME is image/heic', async () => {
      const file = new File(['heic-bytes'], 'sample.heic', { type: 'image/heic' });
      const mockBlob = new Blob(['converted-webp'], { type: 'image/webp' });
      const privSvc = service as unknown as StorageServiceWithPrivates;
      spyOn(privSvc, 'convertHeicBlob').and.resolveTo(mockBlob);

      const onStatusSpy = jasmine.createSpy('onStatus');
      const result = await service.prepareUploadFile(file, onStatusSpy);

      expect(privSvc.convertHeicBlob).toHaveBeenCalledWith(file);
      expect(onStatusSpy).toHaveBeenCalledWith('Optimizando imagen de alta resolución...');
      expect(result.name).toBe('sample.webp');
      expect(result.type).toBe('image/webp');
    });

    it('Blob Array handling: should take first element if heic2any returns Blob[]', async () => {
      const file = new File(['heic-bytes'], 'multi.heic', { type: 'image/heic' });
      const blob1 = new Blob(['frame1'], { type: 'image/webp' });
      const blob2 = new Blob(['frame2'], { type: 'image/webp' });
      const privSvc = service as unknown as StorageServiceWithPrivates;
      spyOn(privSvc, 'convertHeicBlob').and.resolveTo([blob1, blob2]);

      const result = await service.prepareUploadFile(file);

      expect(result.name).toBe('multi.webp');
      expect(result.type).toBe('image/webp');
      expect(result.size).toBe(blob1.size);
    });

    it('Defensive Catch: should recover and return valid File when heic2any throws code 1 already browser readable', async () => {
      const file = new File(['actual-jpeg-bytes'], 'img.heic', { type: 'image/heic' });
      const privSvc = service as unknown as StorageServiceWithPrivates;
      spyOn(console, 'warn');
      spyOn(privSvc, 'convertHeicBlob').and.rejectWith({
        code: 1,
        message: 'ERR_USER Image is already browser readable: image/jpeg',
      });

      const result = await service.prepareUploadFile(file);

      expect(console.warn).toHaveBeenCalled();
      expect(result.name).toBe('img.jpg');
      expect(result.type).toBe('image/jpeg');
    });

    it('Defensive Catch: should recover when heic2any error message contains already browser readable', async () => {
      const file = new File(['actual-png-bytes'], 'picture.heif', { type: '' });
      const privSvc = service as unknown as StorageServiceWithPrivates;
      spyOn(console, 'warn');
      spyOn(privSvc, 'convertHeicBlob').and.rejectWith({
        code: '1',
        message: 'The image is already browser readable: image/png',
      });

      const result = await service.prepareUploadFile(file);

      expect(console.warn).toHaveBeenCalled();
      expect(result.name).toBe('picture.png');
      expect(result.type).toBe('image/png');
    });

    it('should rethrow error when heic2any encounters a genuine conversion failure', async () => {
      const file = new File(['corrupted-bytes'], 'corrupt.heic', { type: 'image/heic' });
      const privSvc = service as unknown as StorageServiceWithPrivates;
      spyOn(console, 'error');
      const genuineError = { code: 2, message: 'ERR_LIBHEIF_CORRUPT' };
      spyOn(privSvc, 'convertHeicBlob').and.rejectWith(genuineError);

      await expectAsync(service.prepareUploadFile(file)).toBeRejectedWith(genuineError);
      expect(console.error).toHaveBeenCalled();
    });

    it('uploadFile: should process HEIC file and start upload with converted file', (done) => {
      const file = new File(['heic-raw'], 'upload-test.heic', { type: 'image/heic' });
      const mockRef = {} as unknown as StorageReference;
      const mockUploadTask = {
        on: jasmine
          .createSpy('on')
          .and.callFake(
            (
              _event: string,
              next: (snapshot: UploadTaskSnapshot) => void,
              _error: (err: unknown) => void,
              complete: () => void,
            ): (() => void) => {
              next({ bytesTransferred: 100, totalBytes: 100 } as unknown as UploadTaskSnapshot);
              complete();
              return (): void => {};
            },
          ),
        then: jasmine
          .createSpy('then')
          .and.callFake(
            (resolve: (snapshot: { ref: StorageReference }) => Promise<unknown> | void) => {
              void resolve({ ref: mockRef });
              return Promise.resolve({ ref: mockRef } as unknown as UploadTaskSnapshot);
            },
          ),
      } as unknown as UploadTask;

      const privSvc = service as unknown as StorageServiceWithPrivates;
      spyOn(privSvc, 'convertHeicBlob').and.resolveTo(new Blob(['webp'], { type: 'image/webp' }));
      spyOn(privSvc, 'getStorageRef').and.returnValue(mockRef);
      spyOn(privSvc, 'uploadBytes').and.returnValue(mockUploadTask);
      spyOn(privSvc, 'getDownloadUrl').and.returnValue(
        Promise.resolve('https://mock.url/upload-test.webp'),
      );

      const upload = service.uploadFile(file, 'products/new');

      upload.downloadUrl$.subscribe({
        next: (url) => {
          expect(url).toBe('https://mock.url/upload-test.webp');
          expect(privSvc.uploadBytes).toHaveBeenCalledWith(
            mockRef,
            jasmine.objectContaining({ name: 'upload-test.webp', type: 'image/webp' }),
          );
          done();
        },
      });
    });
  });

  describe('Safe Web Storage Helpers (Safari/WebKit)', () => {
    it('should read, write, and remove localStorage safely', () => {
      service.setLocalStorageItem('test_key', 'test_val');
      expect(service.getLocalStorageItem('test_key')).toBe('test_val');
      service.removeLocalStorageItem('test_key');
      expect(service.getLocalStorageItem('test_key')).toBeNull();
    });

    it('should handle localStorage throwing errors gracefully', () => {
      spyOn(window.localStorage, 'getItem').and.throwError(new Error('QuotaExceeded'));
      spyOn(window.localStorage, 'setItem').and.throwError(new Error('QuotaExceeded'));
      spyOn(window.localStorage, 'removeItem').and.throwError(new Error('QuotaExceeded'));

      expect(service.getLocalStorageItem('fail')).toBeNull();
      expect(() => service.setLocalStorageItem('fail', 'val')).not.toThrow();
      expect(() => service.removeLocalStorageItem('fail')).not.toThrow();
    });

    it('should read, write, and remove sessionStorage safely', () => {
      service.setSessionStorageItem('sess_key', 'sess_val');
      expect(service.getSessionStorageItem('sess_key')).toBe('sess_val');
      service.removeSessionStorageItem('sess_key');
      expect(service.getSessionStorageItem('sess_key')).toBeNull();
    });

    it('should handle sessionStorage throwing errors gracefully', () => {
      spyOn(window.sessionStorage, 'getItem').and.throwError(new Error('QuotaExceeded'));
      spyOn(window.sessionStorage, 'setItem').and.throwError(new Error('QuotaExceeded'));
      spyOn(window.sessionStorage, 'removeItem').and.throwError(new Error('QuotaExceeded'));

      expect(service.getSessionStorageItem('fail')).toBeNull();
      expect(() => service.setSessionStorageItem('fail', 'val')).not.toThrow();
      expect(() => service.removeSessionStorageItem('fail')).not.toThrow();
    });
  });
});

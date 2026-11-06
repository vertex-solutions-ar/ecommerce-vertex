import { Injectable } from '@angular/core';

export interface ImageValidationResult {
  valid: boolean;
  errors: string[];
  width?: number;
  height?: number;
  aspectRatio?: number;
  fileSize?: number;
}

@Injectable({
  providedIn: 'root',
})
export class ImageValidationService {
  /** Dimensiones mínimas para carousel hero (16:9 aspect ratio) */
  private readonly MIN_WIDTH = 1200;
  private readonly MIN_HEIGHT = 675;
  private readonly IDEAL_WIDTH = 1600;
  private readonly IDEAL_HEIGHT = 900;
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  private readonly IDEAL_ASPECT_RATIO = 16 / 9;
  private readonly ASPECT_RATIO_TOLERANCE = 0.05; // 5% tolerance

  /**
   * Valida una imagen para carousel hero
   * @param file Archivo de imagen a validar
   * @returns Promise con resultado de validación
   */
  async validateHeroImage(file: File): Promise<ImageValidationResult> {
    const errors: string[] = [];
    let width: number | undefined;
    let height: number | undefined;
    let aspectRatio: number | undefined;

    // Validar tipo MIME (imagen JPEG/PNG/WebP)
    if (!this.ALLOWED_MIME_TYPES.includes(file.type)) {
      errors.push(`Formato no permitido: ${file.type || 'desconocido'}. Usá JPG, PNG o WebP.`);
    }

    // Validar tamaño de archivo
    if (file.size > this.MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      errors.push(`El archivo es muy grande (${sizeMB}MB). Máximo permitido: 5MB.`);
    }

    // Validar dimensiones de la imagen
    try {
      const dimensions = await this.getImageDimensions(file);
      width = dimensions.width;
      height = dimensions.height;
      aspectRatio = width / height;

      // Validar resolución mínima
      if (width < this.MIN_WIDTH || height < this.MIN_HEIGHT) {
        errors.push(
          `La resolución es muy baja (${width}x${height}px). Mínimo recomendado: ${this.MIN_WIDTH}x${this.MIN_HEIGHT}px.`,
        );
      }

      // Validar aspect ratio (16:9)
      const expectedRatio = this.IDEAL_ASPECT_RATIO;
      const actualRatio = width / height;
      const ratioDifference = Math.abs(actualRatio - expectedRatio) / expectedRatio;

      if (ratioDifference > this.ASPECT_RATIO_TOLERANCE) {
        errors.push(
          `La proporción de la imagen no es 16:9 (proporción actual: ${actualRatio.toFixed(2)}:1). ` +
            `Redimensiona la imagen correctamente.`,
        );
      }
    } catch {
      errors.push('No se pudo validar las dimensiones de la imagen.');
    }

    return {
      valid: errors.length === 0,
      errors,
      width,
      height,
      aspectRatio,
      fileSize: file.size,
    };
  }

  /**
   * Obtiene las dimensiones de una imagen
   */
  private getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e): void => {
        const img = new Image();
        img.onload = (): void => {
          resolve({ width: img.width, height: img.height });
        };
        img.onerror = (): void => {
          reject(new Error('No se pudo cargar la imagen'));
        };
        img.src = e.target?.result as string;
      };
      reader.onerror = (): void => {
        reject(new Error('Error al leer el archivo'));
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Valida la imagen de un comprobante de pago (formato y peso máximo, sin restricción 16:9)
   * @param file Archivo de imagen a validar
   */
  validateReceiptImage(file: File): ImageValidationResult {
    const errors: string[] = [];

    if (!this.ALLOWED_MIME_TYPES.includes(file.type)) {
      errors.push(`Formato no permitido: ${file.type || 'desconocido'}. Usá JPG, PNG o WebP.`);
    }

    if (file.size > this.MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      errors.push(`El archivo es muy grande (${sizeMB}MB). Máximo permitido: 5MB.`);
    }

    return {
      valid: errors.length === 0,
      errors,
      fileSize: file.size,
    };
  }

  /**
   * Obtiene recomendaciones para mejorar la calidad de imagen
   */
  getQualityRecommendations(): {
    idealResolution: string;
    minResolution: string;
    maxFileSize: string;
    aspectRatio: string;
    formats: string;
  } {
    return {
      idealResolution: `${this.IDEAL_WIDTH}x${this.IDEAL_HEIGHT}px`,
      minResolution: `${this.MIN_WIDTH}x${this.MIN_HEIGHT}px`,
      maxFileSize: '5MB',
      aspectRatio: '16:9',
      formats: 'WebP, JPG, PNG',
    };
  }
}

import { InjectionToken } from '@angular/core';
import { ImageRepository } from '../interfaces/repositories/image.repository';

export const IMAGE_REPOSITORY = new InjectionToken<ImageRepository>('IMAGE_REPOSITORY');

import { Global, Module } from '@nestjs/common';
import { FileStorageService } from './file-storage.service';

/**
 * Module global : expose FileStorageService a toute l'application
 * (uploads/downloads de fichiers) sans import repete.
 */
@Global()
@Module({
  providers: [FileStorageService],
  exports: [FileStorageService],
})
export class StorageModule {}

import { Global, Module } from '@nestjs/common';
import { SupabaseStorageService } from './supabase-storage.service';

/**
 * Module global : expose SupabaseStorageService à toute l'application
 * (uploads/downloads de fichiers) sans import répété.
 */
@Global()
@Module({
  providers: [SupabaseStorageService],
  exports: [SupabaseStorageService],
})
export class StorageModule {}

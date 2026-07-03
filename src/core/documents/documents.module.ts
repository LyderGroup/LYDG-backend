import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RbacModule } from '../rbac/rbac.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { LoginHistory } from '../users/login-history.entity';
import { DocumentLibrary, Folder } from './entities';
import { DocumentLibraryController, FolderController } from './controllers';
import { DocumentLibraryService, FolderService } from './services';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    RbacModule,
    TypeOrmModule.forFeature([
      DocumentLibrary,
      Folder,
      LoginHistory, // requis par FirebaseAuthGuard global
    ]),
  ],
  controllers: [DocumentLibraryController, FolderController],
  providers: [DocumentLibraryService, FolderService],
  exports: [DocumentLibraryService, FolderService],
})
export class DocumentsModule {}

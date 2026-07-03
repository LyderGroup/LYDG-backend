import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RbacModule } from '../rbac/rbac.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { LoginHistory } from '../users/login-history.entity';
import {
  Contact,
  ContactCategory,
  ContactType,
  Invoice,
  InvoiceItem,
  Payment,
} from './entities';
import { ContactController, InvoiceController, PaymentController } from './controllers';
import { ContactService, InvoiceService, PaymentService, FinancePdfService } from './services';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    RbacModule,
    TypeOrmModule.forFeature([
      Contact,
      ContactType,
      ContactCategory,
      Invoice,
      InvoiceItem,
      Payment,
      // Requis par FirebaseAuthGuard (réutilisé via APP_GUARD global)
      LoginHistory,
    ]),
  ],
  controllers: [ContactController, InvoiceController, PaymentController],
  providers: [ContactService, InvoiceService, PaymentService, FinancePdfService],
  exports: [ContactService, InvoiceService, PaymentService],
})
export class FinanceModule {}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeProfile } from './employee-profile.entity';
import { Employee } from './employee.entity';

@Injectable()
export class EmployeeProfileService {
  constructor(
    @InjectRepository(EmployeeProfile)
    private profileRepository: Repository<EmployeeProfile>,
    @InjectRepository(Employee)
    private employeeRepository: Repository<Employee>,
  ) {}

  async getProfileByEmployeeId(employeeId: string): Promise<{
    profile: EmployeeProfile | null;
    completionPercentage: number;
    sections: Record<string, number>;
  }> {
    let profile = await this.profileRepository.findOne({
      where: { employeeId },
      relations: ['employee', 'employee.user', 'employee.department'],
    });

    if (!profile) {
      // Créer un profil vide si n'existe pas
      const employee = await this.employeeRepository.findOne({
        where: { id: employeeId },
        relations: ['user', 'department'],
      });
      if (!employee) {
        throw new NotFoundException('Employé non trouvé');
      }

      // Pré-remplir avec les données existantes de l'employé
      profile = this.profileRepository.create({
        employeeId,
        lastName: employee.user?.lastName || null,
        firstName: employee.user?.firstName || null,
        birthDate: employee.birthDate,
        birthPlace: employee.birthPlace,
        maritalStatus: employee.maritalStatus,
        childrenCount: employee.dependentsCount,
        phonePrimary: employee.user?.phone || null,
        personalEmail: employee.user?.email || null,
        emergency1Name: employee.emergencyContactName,
        emergency1Relationship: employee.emergencyContactRelationship,
        emergency1Phone: employee.emergencyContactPhone,
      });
      await this.profileRepository.save(profile);
    }

    const completion = this.calculateCompletionPercentage(profile);

    return {
      profile,
      completionPercentage: completion.total,
      sections: completion.sections,
    };
  }

  async updateProfile(
    employeeId: string,
    updateData: Partial<EmployeeProfile>,
  ): Promise<{ success: boolean; profile: EmployeeProfile; completionPercentage: number }> {
    let profile = await this.profileRepository.findOne({
      where: { employeeId },
    });

    if (!profile) {
      profile = this.profileRepository.create({ employeeId });
    }

    // Filtrer les champs non modifiables
    const {
      id,
      employeeId: _,
      createdAt,
      updatedAt,
      isCompleted,
      completedAt,
      validatedAt,
      validatedBy,
      ...editableFields
    } = updateData as any;

    // Mettre à jour les champs
    Object.assign(profile, editableFields);

    const saved = await this.profileRepository.save(profile);
    const completion = this.calculateCompletionPercentage(saved);

    return {
      success: true,
      profile: saved,
      completionPercentage: completion.total,
    };
  }

  async completeProfile(
    employeeId: string,
    signatureData: string,
    signaturePlace: string,
  ): Promise<{ success: boolean; message: string }> {
    const profile = await this.profileRepository.findOne({
      where: { employeeId },
    });

    if (!profile) {
      return { success: false, message: 'Profil non trouvé' };
    }

    const completion = this.calculateCompletionPercentage(profile);
    if (completion.total < 80) {
      return {
        success: false,
        message: `Profil incomplet (${completion.total}%). Veuillez remplir au moins 80% du profil.`,
      };
    }

    profile.signatureData = signatureData;
    profile.signaturePlace = signaturePlace;
    profile.signatureDate = new Date();
    profile.isCompleted = true;
    profile.completedAt = new Date();

    await this.profileRepository.save(profile);

    return { success: true, message: 'Profil complété avec succès' };
  }

  async validateProfile(
    employeeId: string,
    validatedBy: string,
  ): Promise<{ success: boolean; message: string }> {
    const profile = await this.profileRepository.findOne({
      where: { employeeId },
    });

    if (!profile) {
      return { success: false, message: 'Profil non trouvé' };
    }

    if (!profile.isCompleted) {
      return { success: false, message: 'Le profil doit être complété avant validation' };
    }

    profile.validatedAt = new Date();
    profile.validatedBy = validatedBy;

    await this.profileRepository.save(profile);

    return { success: true, message: 'Profil validé avec succès' };
  }

  async getCompletionStats(organizationId: string): Promise<{
    totalEmployees: number;
    completedProfiles: number;
    validatedProfiles: number;
    averageCompletion: number;
  }> {
    const employees = await this.employeeRepository.find({
      where: { organizationId, employmentStatus: 'active' },
    });

    const employeeIds = employees.map((e) => e.id);

    if (employeeIds.length === 0) {
      return {
        totalEmployees: 0,
        completedProfiles: 0,
        validatedProfiles: 0,
        averageCompletion: 0,
      };
    }

    const profiles = await this.profileRepository
      .createQueryBuilder('profile')
      .where('profile.employeeId IN (:...employeeIds)', { employeeIds })
      .getMany();

    const completedProfiles = profiles.filter((p) => p.isCompleted).length;
    const validatedProfiles = profiles.filter((p) => p.validatedAt).length;

    const totalCompletion = profiles.reduce((sum, p) => {
      return sum + this.calculateCompletionPercentage(p).total;
    }, 0);

    return {
      totalEmployees: employees.length,
      completedProfiles,
      validatedProfiles,
      averageCompletion: Math.round(totalCompletion / employees.length),
    };
  }

  private calculateCompletionPercentage(profile: EmployeeProfile): {
    total: number;
    sections: Record<string, number>;
  } {
    /** Un champ compte comme rempli s'il n'est ni nul, ni vide après trim. */
    const isFilled = (v: unknown): boolean =>
      v !== null && v !== undefined && String(v).trim() !== '';

    const sections: Record<string, number> = {};

    // Section 1: Informations personnelles (20 points)
    const personalFields = [
      profile.lastName,
      profile.firstName,
      profile.birthDate,
      profile.birthPlace,
      profile.nationality,
      profile.maritalStatus,
      profile.gender,
      profile.address,
      profile.phonePrimary,
      profile.personalEmail,
    ];
    const personalFilled = personalFields.filter((f) => f !== null && f !== undefined && f !== '').length;
    sections['personal'] = Math.round((personalFilled / personalFields.length) * 20);

    // Section 2: Informations professionnelles (15 points)
    const professionalFields = [
      profile.educationLevel,
      profile.specialty,
      profile.keySkills,
      profile.languagesSpoken,
    ];
    const professionalFilled = professionalFields.filter((f) => f !== null && f !== undefined && f !== '').length;
    sections['professional'] = Math.round((professionalFilled / professionalFields.length) * 15);

    // Section 3: Contacts d'urgence (15 points)
    const emergencyFields = [
      profile.emergency1Name,
      profile.emergency1Relationship,
      profile.emergency1Phone,
    ];
    const emergencyFilled = emergencyFields.filter((f) => f !== null && f !== undefined && f !== '').length;
    sections['emergency'] = Math.round((emergencyFilled / emergencyFields.length) * 15);

    // Section 4: Informations médicales (15 points)
    // `bloodGroup` est une CHAÎNE : le filtre `f === true` d'origine ne la
    // comptait jamais, plafonnant la section à la moitié de ses points même
    // entièrement remplie. On teste donc chaque critère en booléen explicite.
    const medicalFields = [
      isFilled(profile.bloodGroup),
      profile.chronicDiseases !== null || profile.allergies !== null,
    ];
    const medicalFilled = medicalFields.filter((f) => f === true).length;
    sections['medical'] = Math.round((medicalFilled / medicalFields.length) * 15);

    // Section 5: Informations logistiques (10 points)
    // Même correction que la section médicale : `transportMode` est une chaîne.
    const logisticsFields = [
      isFilled(profile.transportMode),
      profile.hasPersonalVehicle !== null,
      profile.availableForTravel !== null,
    ];
    const logisticsFilled = logisticsFields.filter((f) => f === true).length;
    sections['logistics'] = Math.round((logisticsFilled / logisticsFields.length) * 10);

    // Section 6: Informations bancaires (15 points)
    const bankFields = [
      profile.bankName,
      profile.bankAccountNumber,
    ];
    const bankFilled = bankFields.filter((f) => f !== null && f !== undefined && f !== '').length;
    sections['bank'] = Math.round((bankFilled / bankFields.length) * 15);

    // Section 7: Présence digitale (5 points)
    const digitalFields = [
      profile.linkedinUrl,
      profile.facebookUrl,
    ];
    const digitalFilled = digitalFields.filter((f) => f !== null && f !== undefined && f !== '').length;
    sections['digital'] = Math.round((digitalFilled / digitalFields.length) * 5);

    // Section 8: Signature (5 points)
    sections['signature'] = profile.isCompleted ? 5 : 0;

    const total = Object.values(sections).reduce((sum, v) => sum + v, 0);

    return { total: Math.min(100, total), sections };
  }
}

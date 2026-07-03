import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Employee } from './employee.entity';

@Entity({ schema: 'module_c_rh', name: 'employee_profiles' })
export class EmployeeProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @OneToOne(() => Employee, { nullable: false })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;
  
  @Column({ type: 'varchar', length: 100, name: 'last_name', nullable: true })
  lastName!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'first_name', nullable: true })
  firstName!: string | null;

  @Column({ type: 'date', name: 'birth_date', nullable: true })
  birthDate!: Date | null;

  @Column({ type: 'varchar', length: 255, name: 'birth_place', nullable: true })
  birthPlace!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'nationality', nullable: true })
  nationality!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'marital_status', nullable: true })
  maritalStatus!: string | null;

  @Column({ type: 'int', name: 'children_count', nullable: true })
  childrenCount!: number | null;

  @Column({ type: 'varchar', length: 20, name: 'gender', nullable: true })
  gender!: string | null;

  @Column({ type: 'text', name: 'address', nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'neighborhood', nullable: true })
  neighborhood!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'commune', nullable: true })
  commune!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'city', nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', length: 20, name: 'phone_primary', nullable: true })
  phonePrimary!: string | null;

  @Column({ type: 'varchar', length: 20, name: 'phone_secondary', nullable: true })
  phoneSecondary!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'personal_email', nullable: true })
  personalEmail!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'id_number', nullable: true })
  idNumber!: string | null;

  @Column({ type: 'date', name: 'id_expiry_date', nullable: true })
  idExpiryDate!: Date | null;

  @Column({ type: 'varchar', length: 100, name: 'education_level', nullable: true })
  educationLevel!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'specialty', nullable: true })
  specialty!: string | null;

  @Column({ type: 'text', name: 'institutions_attended', nullable: true })
  institutionsAttended!: string | null;

  @Column({ type: 'text', name: 'previous_experience', nullable: true })
  previousExperience!: string | null;

  @Column({ type: 'text', name: 'key_skills', nullable: true })
  keySkills!: string | null;

  @Column({ type: 'text', name: 'languages_spoken', nullable: true })
  languagesSpoken!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'emergency1_name', nullable: true })
  emergency1Name!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'emergency1_relationship', nullable: true })
  emergency1Relationship!: string | null;

  @Column({ type: 'varchar', length: 20, name: 'emergency1_phone', nullable: true })
  emergency1Phone!: string | null;

  @Column({ type: 'varchar', length: 20, name: 'emergency1_phone_secondary', nullable: true })
  emergency1PhoneSecondary!: string | null;

  // Contact 2
  @Column({ type: 'varchar', length: 255, name: 'emergency2_name', nullable: true })
  emergency2Name!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'emergency2_relationship', nullable: true })
  emergency2Relationship!: string | null;

  @Column({ type: 'varchar', length: 20, name: 'emergency2_phone', nullable: true })
  emergency2Phone!: string | null;

  @Column({ type: 'varchar', length: 20, name: 'emergency2_phone_secondary', nullable: true })
  emergency2PhoneSecondary!: string | null;

  @Column({ type: 'varchar', length: 10, name: 'blood_group', nullable: true })
  bloodGroup!: string | null;

  @Column({ type: 'varchar', length: 10, name: 'blood_rhesus', nullable: true })
  bloodRhesus!: string | null;

  @Column({ type: 'text', name: 'chronic_diseases', nullable: true })
  chronicDiseases!: string | null;

  @Column({ type: 'text', name: 'regular_medications', nullable: true })
  regularMedications!: string | null;

  @Column({ type: 'text', name: 'allergies', nullable: true })
  allergies!: string | null;

  @Column({ type: 'text', name: 'emergency_instructions', nullable: true })
  emergencyInstructions!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'doctor_name', nullable: true })
  doctorName!: string | null;

  @Column({ type: 'varchar', length: 20, name: 'doctor_phone', nullable: true })
  doctorPhone!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'reference_hospital', nullable: true })
  referenceHospital!: string | null;

  @Column({ type: 'boolean', name: 'has_disability', nullable: true })
  hasDisability!: boolean | null;

  @Column({ type: 'text', name: 'disability_details', nullable: true })
  disabilityDetails!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'transport_mode', nullable: true })
  transportMode!: string | null;

  @Column({ type: 'boolean', name: 'has_personal_vehicle', nullable: true })
  hasPersonalVehicle!: boolean | null;

  @Column({ type: 'int', name: 'commute_time_minutes', nullable: true })
  commuteTimeMinutes!: number | null;

  @Column({ type: 'boolean', name: 'available_for_travel', nullable: true })
  availableForTravel!: boolean | null;

  @Column({ type: 'varchar', length: 255, name: 'preferred_rest_days', nullable: true })
  preferredRestDays!: string | null;

  @Column({ type: 'text', name: 'personal_constraints', nullable: true })
  personalConstraints!: string | null;

  @Column({ type: 'text', name: 'personal_resources', nullable: true })
  personalResources!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'bank_name', nullable: true })
  bankName!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'bank_account_number', nullable: true })
  bankAccountNumber!: string | null;

  @Column({ type: 'varchar', length: 20, name: 'mobile_money_number', nullable: true })
  mobileMoneyNumber!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'mobile_money_network', nullable: true })
  mobileMoneyNetwork!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'linkedin_url', nullable: true })
  linkedinUrl!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'instagram_url', nullable: true })
  instagramUrl!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'tiktok_url', nullable: true })
  tiktokUrl!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'facebook_url', nullable: true })
  facebookUrl!: string | null;

  @Column({ type: 'text', name: 'other_platforms', nullable: true })
  otherPlatforms!: string | null;

  @Column({ type: 'date', name: 'signature_date', nullable: true })
  signatureDate!: Date | null;

  @Column({ type: 'varchar', length: 255, name: 'signature_place', nullable: true })
  signaturePlace!: string | null;

  @Column({ type: 'text', name: 'signature_data', nullable: true })
  signatureData!: string | null;

  @Column({ type: 'boolean', name: 'is_completed', default: false })
  isCompleted!: boolean;

  @Column({ type: 'timestamp', name: 'completed_at', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'timestamp', name: 'validated_at', nullable: true })
  validatedAt!: Date | null;

  @Column({ type: 'uuid', name: 'validated_by', nullable: true })
  validatedBy!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}

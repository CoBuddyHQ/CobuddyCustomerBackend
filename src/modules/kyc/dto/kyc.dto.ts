import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum KycDocType {
  AADHAAR = 'AADHAAR',
  PAN = 'PAN',
  PASSPORT = 'PASSPORT',
  DL = 'DL',
}

export class SubmitKycDocumentDto {
  @ApiProperty({ enum: KycDocType })
  @IsEnum(KycDocType)
  docType: KycDocType;

  @ApiProperty({ example: '1234 5678 9012' })
  @IsString()
  docNumber: string;

  @ApiProperty({ example: 'Shlok Verma' })
  @IsString()
  legalName: string;
}

import { IsIn, IsNotEmpty, IsString, IsOptional, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitKycDocumentDto {
  @ApiPropertyOptional({ example: 'AADHAAR' })
  @ValidateIf(o => o.docType !== undefined || !o.documentType)
  @IsString()
  @IsNotEmpty()
  @IsIn(['AADHAAR', 'PAN', 'PASSPORT', 'DL', 'DRIVING_LICENSE', 'VOTER_ID'])
  docType: string;

  @ApiPropertyOptional({ example: 'AADHAAR' })
  @IsString()
  @IsNotEmpty()
  @IsIn(['AADHAAR', 'PAN', 'PASSPORT', 'DL', 'DRIVING_LICENSE', 'VOTER_ID'])
  @IsOptional()
  documentType?: string;

  @ApiPropertyOptional({ example: '1234 5678 9012' })
  @ValidateIf(o => o.docNumber !== undefined || !o.documentNumber)
  @IsString()
  @IsNotEmpty()
  docNumber: string;

  @ApiPropertyOptional({ example: '1234 5678 9012' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  documentNumber?: string;

  @ApiPropertyOptional({ example: 'Shlok Verma' })
  @IsString()
  @IsNotEmpty()
  legalName: string;
}

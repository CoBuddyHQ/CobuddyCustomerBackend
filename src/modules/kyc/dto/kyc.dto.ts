import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitKycDocumentDto {
  @ApiPropertyOptional({ example: 'AADHAAR' })
  @IsString()
  @IsNotEmpty()
  @IsIn(['AADHAAR', 'PAN', 'PASSPORT', 'DL', 'DRIVING_LICENSE', 'VOTER_ID'])
  docType: string;

  @ApiPropertyOptional({ example: 'AADHAAR' })
  @IsString()
  @IsNotEmpty()
  @IsIn(['AADHAAR', 'PAN', 'PASSPORT', 'DL', 'DRIVING_LICENSE', 'VOTER_ID'])
  documentType?: string;

  @ApiPropertyOptional({ example: '1234 5678 9012' })
  @IsString()
  @IsNotEmpty()
  docNumber: string;

  @ApiPropertyOptional({ example: '1234 5678 9012' })
  @IsString()
  @IsNotEmpty()
  documentNumber?: string;

  @ApiPropertyOptional({ example: 'Shlok Verma' })
  @IsString()
  @IsNotEmpty()
  legalName: string;
}

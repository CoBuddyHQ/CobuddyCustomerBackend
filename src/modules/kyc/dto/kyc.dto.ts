import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitKycDocumentDto {
  @ApiPropertyOptional({ example: 'AADHAAR' })
  @IsString()
  @IsOptional()
  docType?: string;

  @ApiPropertyOptional({ example: 'AADHAAR' })
  @IsString()
  @IsOptional()
  documentType?: string;

  @ApiPropertyOptional({ example: '1234 5678 9012' })
  @IsString()
  @IsOptional()
  docNumber?: string;

  @ApiPropertyOptional({ example: '1234 5678 9012' })
  @IsString()
  @IsOptional()
  documentNumber?: string;

  @ApiPropertyOptional({ example: 'Shlok Verma' })
  @IsString()
  @IsOptional()
  legalName?: string;
}

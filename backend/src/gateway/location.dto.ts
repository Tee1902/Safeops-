import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsUUID,
} from 'class-validator';

export class LocationSharingDto {
  @IsUUID('4')
  assignmentId: string;

  @IsBoolean()
  enabled: boolean;
}

export class LocationUpdateDto {
  @IsUUID('4')
  assignmentId: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsLatitude()
  latitude: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsLongitude()
  longitude: number;
}

import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';

@Injectable()
export class PositiveIntPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const parsed = Number(value);
    if (
      !/^\d+$/.test(value) ||
      !Number.isInteger(parsed) ||
      parsed < 1 ||
      parsed > 2147483647
    )
      throw new BadRequestException(
        'ID phải là số nguyên từ 1 đến 2147483647.',
      );
    return parsed;
  }
}

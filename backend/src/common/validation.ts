import { Transform } from 'class-transformer';
import { registerDecorator } from 'class-validator';

export function TrimText() {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}

export function NumericInput() {
  return Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
    return Number.NaN;
  });
}

// bcrypt uses the first 72 UTF-8 bytes, which may be fewer than 72 characters.
export function MaxPasswordBytes() {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'maxPasswordBytes',
      target: target.constructor,
      propertyName,
      options: { message: '$property must not exceed 72 UTF-8 bytes' },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 72,
      },
    });
  };
}

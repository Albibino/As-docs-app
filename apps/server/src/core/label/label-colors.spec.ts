import { validate } from 'class-validator';
import { CreateLabelTreeDto } from './dto/label.dto';
import { LABEL_COLORS } from './label-colors';

describe('cores das árvores de labels', () => {
  it('expõe dezesseis chaves de paleta, preservando as existentes', () => {
    expect(LABEL_COLORS).toHaveLength(16);
    expect(LABEL_COLORS).toEqual(
      expect.arrayContaining([
        'slate',
        'blue',
        'green',
        'amber',
        'red',
        'purple',
        'pink',
        'teal',
        'cyan',
        'indigo',
        'lime',
        'orange',
        'yellow',
        'rose',
        'violet',
        'fuchsia',
      ]),
    );
  });

  it.each(LABEL_COLORS)('aceita a chave %s no DTO de árvore', async (color) => {
    const dto = Object.assign(new CreateLabelTreeDto(), {
      name: 'Árvore de teste',
      color,
    });

    expect(
      (await validate(dto)).filter((error) => error.property === 'color'),
    ).toEqual([]);
  });
});

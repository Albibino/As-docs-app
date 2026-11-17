import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  IParagraphOptions,
  IRunOptions,
  ImageRun,
  LevelFormat,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip,
} from 'docx';
import { DocxImageType, readImageSize } from './image-size';

export interface DocxAttachmentImage {
  data: Buffer;
}

export interface ProsemirrorToDocxOptions {
  title: string;
  // Keyed by the `attachmentId` attribute carried on image nodes.
  images?: Map<string, DocxAttachmentImage>;
  // Turns the editor's root-relative links into something a reader outside the
  // app can follow.
  baseUrl?: string;
}

type Block = Paragraph | Table;
type InlineChild = TextRun | ImageRun | ExternalHyperlink;
// `docx` declares its option bags readonly, which is fine for callers but not
// for accumulating one mark at a time.
type MutableRunOptions = { -readonly [K in keyof IRunOptions]: IRunOptions[K] };

const ORDERED_NUMBERING_REFERENCE = 'prosemirror-ordered';
const MAX_LIST_DEPTH = 4;
const CODE_FONT = 'Courier New';
const SHADED_FILL = 'F1F3F5';
const MUTED_COLOR = '868E96';
const BORDER_COLOR = 'CED4DA';
// Word's default page is 8.5in wide with 1in margins on both sides.
const CONTENT_WIDTH_PX = 624;

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

interface ListContext {
  type: 'bullet' | 'ordered' | 'task';
  level: number;
  instance: number;
  // Continuation blocks of a list item line up with the marker instead of
  // repeating it.
  isContinuation?: boolean;
}

interface BlockContext {
  list?: ListContext;
  // Decoration inherited from a wrapper the docx model has no node for, such as
  // a blockquote's rule or a callout's fill.
  paragraph?: IParagraphOptions;
  // Rendered once, before the content of the first paragraph it reaches.
  prefix?: IRunOptions;
}

interface ConversionState {
  options: ProsemirrorToDocxOptions;
  // Word restarts an ordered list only when it is given a fresh instance.
  nextOrderedInstance: number;
}

export function prosemirrorToDocx(
  prosemirrorJson: any,
  options: ProsemirrorToDocxOptions,
): Document {
  const state: ConversionState = { options, nextOrderedInstance: 0 };

  const body: Block[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 240 },
      children: [new TextRun({ text: options.title || 'untitled' })],
    }),
    ...convertNodes(prosemirrorJson?.content ?? [], state, {}),
  ];

  return new Document({
    numbering: {
      config: [
        {
          reference: ORDERED_NUMBERING_REFERENCE,
          levels: Array.from({ length: MAX_LIST_DEPTH + 1 }, (_, level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: {
              paragraph: {
                indent: {
                  left: convertInchesToTwip(0.5 * (level + 1)),
                  hanging: convertInchesToTwip(0.25),
                },
              },
            },
          })),
        },
      ],
    },
    sections: [{ children: body }],
  });
}

function convertNodes(
  nodes: any[],
  state: ConversionState,
  context: BlockContext,
): Block[] {
  const blocks: Block[] = [];
  let remainingPrefix = context.prefix;

  for (const node of nodes) {
    const converted = convertNode(node, state, {
      ...context,
      prefix: remainingPrefix,
    });

    // A prefix belongs to the first paragraph it can reach and nowhere else.
    if (remainingPrefix && converted.some((b) => b instanceof Paragraph)) {
      remainingPrefix = undefined;
    }

    blocks.push(...converted);
  }

  return blocks;
}

function convertNode(
  node: any,
  state: ConversionState,
  context: BlockContext,
): Block[] {
  switch (node?.type) {
    case 'paragraph':
      return [
        paragraph(context, {
          alignment: alignmentOf(node),
          children: inlineChildren(node, state, context),
        }),
      ];

    case 'heading': {
      const level = Math.min(Math.max(node.attrs?.level ?? 1, 1), 6);
      return [
        paragraph(context, {
          heading: HEADING_LEVELS[level - 1],
          alignment: alignmentOf(node),
          spacing: { before: 240, after: 120 },
          children: inlineChildren(node, state, context),
        }),
      ];
    }

    case 'bulletList':
      return convertList(node, state, context, 'bullet');

    case 'orderedList':
      return convertList(node, state, context, 'ordered');

    case 'taskList':
      return convertList(node, state, context, 'task');

    case 'listItem':
    case 'taskItem':
      return convertListItem(node, state, context);

    case 'blockquote':
      return convertNodes(node.content ?? [], state, {
        ...context,
        paragraph: {
          ...context.paragraph,
          indent: { left: convertInchesToTwip(0.5) },
          border: {
            left: {
              style: BorderStyle.SINGLE,
              size: 12,
              color: BORDER_COLOR,
              space: 8,
            },
          },
        },
      });

    case 'callout':
      return convertNodes(node.content ?? [], state, {
        ...context,
        paragraph: {
          ...context.paragraph,
          shading: { type: ShadingType.CLEAR, fill: SHADED_FILL },
          indent: { left: convertInchesToTwip(0.25) },
        },
      });

    case 'codeBlock':
      return convertCodeBlock(node, context);

    case 'horizontalRule':
      return [
        new Paragraph({
          spacing: { before: 120, after: 120 },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: BORDER_COLOR },
          },
          children: [],
        }),
      ];

    case 'pageBreak':
      return [new Paragraph({ pageBreakBefore: true, children: [] })];

    case 'image':
      return convertImage(node, state, context);

    case 'table':
      return convertTable(node, state);

    case 'detailsSummary':
      return [
        paragraph(context, {
          spacing: { before: 120, after: 60 },
          children: inlineChildren(node, state, context, { bold: true }),
        }),
      ];

    case 'details':
    case 'detailsContent':
    case 'columns':
    case 'column':
      // Containers with no Word equivalent: keep the content, drop the frame.
      return convertNodes(node.content ?? [], state, context);

    case 'attachment':
    case 'video':
    case 'audio':
    case 'pdf':
      return convertFileAttachment(node, context);

    case 'mathBlock':
      return [
        paragraph(context, {
          children: [
            new TextRun({ text: node.attrs?.text ?? '', font: CODE_FONT }),
          ],
        }),
      ];

    default:
      // Unknown node: recurse so its text still reaches the document.
      return node?.content ? convertNodes(node.content, state, context) : [];
  }
}

function paragraph(
  context: BlockContext,
  options: IParagraphOptions & { children: readonly InlineChild[] },
): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    ...context.paragraph,
    ...listFormatting(context.list),
    ...options,
  });
}

function inlineChildren(
  node: any,
  state: ConversionState,
  context: BlockContext,
  extraRunOptions?: IRunOptions,
): InlineChild[] {
  const children = convertInline(node.content ?? [], state, extraRunOptions);
  if (!context.prefix) return children;
  return [new TextRun(context.prefix), ...children];
}

function listFormatting(list?: ListContext): IParagraphOptions {
  if (!list) return {};

  const indent = { left: convertInchesToTwip(0.5 * (list.level + 1)) };

  if (list.isContinuation) {
    return { indent, spacing: { after: 60 } };
  }

  if (list.type === 'ordered') {
    return {
      numbering: {
        reference: ORDERED_NUMBERING_REFERENCE,
        level: list.level,
        instance: list.instance,
      },
      spacing: { after: 60 },
    };
  }

  // Task items carry their own checkbox glyph, so they indent like a list but
  // must not also get Word's bullet.
  if (list.type === 'task') {
    return { indent, spacing: { after: 60 } };
  }

  return { bullet: { level: list.level }, spacing: { after: 60 } };
}

function convertList(
  node: any,
  state: ConversionState,
  context: BlockContext,
  type: ListContext['type'],
): Block[] {
  const parent = context.list;
  const level = Math.min(parent ? parent.level + 1 : 0, MAX_LIST_DEPTH);
  const instance =
    type === 'ordered' ? state.nextOrderedInstance++ : (parent?.instance ?? 0);

  return convertNodes(node.content ?? [], state, {
    ...context,
    list: { type, level, instance },
  });
}

function convertListItem(
  node: any,
  state: ConversionState,
  context: BlockContext,
): Block[] {
  const list: ListContext = context.list ?? {
    type: 'bullet',
    level: 0,
    instance: 0,
  };
  const blocks: Block[] = [];
  let isFirstBlock = true;

  for (const child of node.content ?? []) {
    const isNestedList = ['bulletList', 'orderedList', 'taskList'].includes(
      child?.type,
    );

    if (isNestedList) {
      blocks.push(...convertNode(child, state, { ...context, list }));
      continue;
    }

    const converted = convertNode(child, state, {
      ...context,
      list: isFirstBlock ? list : { ...list, isContinuation: true },
      prefix:
        isFirstBlock && list.type === 'task'
          ? { text: node.attrs?.checked === true ? '☒ ' : '☐ ' }
          : undefined,
    });

    if (converted.length) isFirstBlock = false;
    blocks.push(...converted);
  }

  return blocks;
}

function convertCodeBlock(node: any, context: BlockContext): Paragraph[] {
  const code = collectText(node);
  const lines = code.length ? code.split('\n') : [''];

  return lines.map((line, index) =>
    paragraph(context, {
      spacing: {
        before: index === 0 ? 120 : 0,
        after: index === lines.length - 1 ? 120 : 0,
      },
      shading: { type: ShadingType.CLEAR, fill: SHADED_FILL },
      children: [new TextRun({ text: line, font: CODE_FONT, size: 20 })],
    }),
  );
}

function convertFileAttachment(node: any, context: BlockContext): Paragraph[] {
  const name =
    node.attrs?.name || node.attrs?.title || node.attrs?.src || 'attachment';
  const url = node.attrs?.url ?? node.attrs?.src;

  return [
    paragraph(context, {
      children: [
        url
          ? new ExternalHyperlink({
              link: String(url),
              children: [
                new TextRun({ text: String(name), style: 'Hyperlink' }),
              ],
            })
          : new TextRun({ text: String(name), color: MUTED_COLOR }),
      ],
    }),
  ];
}

function convertImage(
  node: any,
  state: ConversionState,
  context: BlockContext,
): Paragraph[] {
  const attachmentId = node.attrs?.attachmentId;
  const image = attachmentId
    ? state.options.images?.get(attachmentId)
    : undefined;
  const intrinsic = image ? readImageSize(image.data) : null;

  // An image the export could not read is still worth announcing — a silent gap
  // reads as lost content.
  if (!image || !intrinsic) {
    return [
      paragraph(context, {
        children: [
          new TextRun({
            text: `[${node.attrs?.alt || node.attrs?.title || 'image'}]`,
            color: MUTED_COLOR,
            italics: true,
          }),
        ],
      }),
    ];
  }

  const { width, height } = fitToPage(intrinsic, node.attrs?.width);

  return [
    paragraph(context, {
      alignment: alignmentOf(node),
      spacing: { before: 120, after: 120 },
      children: [
        new ImageRun({
          data: image.data,
          type: intrinsic.type as DocxImageType,
          transformation: { width, height },
          // Word leaves these blank without complaint, but stricter viewers
          // treat a nameless drawing as an object they cannot resolve and show
          // a placeholder box instead of the picture.
          altText: {
            name: `image-${attachmentId}.${intrinsic.type}`,
            title: node.attrs?.title || node.attrs?.alt || 'image',
            description: node.attrs?.alt || node.attrs?.title || 'image',
          },
        }),
      ],
    }),
  ];
}

function fitToPage(
  intrinsic: { width: number; height: number },
  requestedWidth: unknown,
): { width: number; height: number } {
  const ratio = intrinsic.height / intrinsic.width;
  const requested =
    typeof requestedWidth === 'number' && requestedWidth > 0
      ? requestedWidth
      : intrinsic.width;
  const width = Math.min(requested, CONTENT_WIDTH_PX);

  return { width: Math.round(width), height: Math.round(width * ratio) };
}

function convertTable(node: any, state: ConversionState): Table[] {
  const rows = (node.content ?? []).filter(
    (row: any) => row?.type === 'tableRow',
  );
  if (rows.length === 0) return [];

  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: rows.map((row: any) => {
        const cells = (row.content ?? []).filter(Boolean);

        return new TableRow({
          tableHeader:
            cells.length > 0 &&
            cells.every((cell: any) => cell?.type === 'tableHeader'),
          children: cells.map((cell: any) => {
            const blocks = convertNodes(cell.content ?? [], state, {});

            return new TableCell({
              columnSpan: cell.attrs?.colspan ?? 1,
              rowSpan: cell.attrs?.rowspan ?? 1,
              shading:
                cell.type === 'tableHeader'
                  ? { type: ShadingType.CLEAR, fill: SHADED_FILL }
                  : undefined,
              children: blocks.length
                ? blocks
                : [new Paragraph({ children: [] })],
            });
          }),
        });
      }),
    }),
  ];
}

function convertInline(
  nodes: any[],
  state: ConversionState,
  extraRunOptions?: IRunOptions,
): InlineChild[] {
  return nodes.flatMap((node) =>
    convertInlineNode(node, state, extraRunOptions),
  );
}

function convertInlineNode(
  node: any,
  state: ConversionState,
  extraRunOptions?: IRunOptions,
): InlineChild[] {
  if (node?.type === 'hardBreak') {
    return [new TextRun({ break: 1 })];
  }

  if (node?.type === 'mention') {
    return [
      new TextRun({
        ...extraRunOptions,
        text: `@${node.attrs?.label ?? node.attrs?.entityType ?? ''}`,
        bold: true,
      }),
    ];
  }

  if (node?.type === 'mathInline') {
    return [
      new TextRun({
        ...extraRunOptions,
        text: node.attrs?.text ?? '',
        font: CODE_FONT,
      }),
    ];
  }

  if (node?.type !== 'text') {
    return node?.content
      ? convertInline(node.content, state, extraRunOptions)
      : [];
  }

  const runOptions = {
    ...extraRunOptions,
    ...runOptionsFromMarks(node.marks ?? []),
  };
  const link = linkFromMarks(node.marks ?? [], state.options.baseUrl);
  const text = node.text ?? '';

  if (!link) return [new TextRun({ ...runOptions, text })];

  return [
    new ExternalHyperlink({
      link,
      children: [new TextRun({ ...runOptions, text, style: 'Hyperlink' })],
    }),
  ];
}

function runOptionsFromMarks(marks: any[]): IRunOptions {
  const options: MutableRunOptions = {};

  for (const mark of marks) {
    switch (mark?.type) {
      case 'bold':
        options.bold = true;
        break;
      case 'italic':
        options.italics = true;
        break;
      case 'underline':
        options.underline = {};
        break;
      case 'strike':
        options.strike = true;
        break;
      case 'superscript':
        options.superScript = true;
        break;
      case 'subscript':
        options.subScript = true;
        break;
      case 'code':
        options.font = CODE_FONT;
        options.shading = { type: ShadingType.CLEAR, fill: SHADED_FILL };
        break;
      case 'textStyle':
        if (mark.attrs?.color) {
          options.color = normalizeColor(mark.attrs.color);
        }
        break;
      case 'highlight':
        if (mark.attrs?.color) {
          options.shading = {
            type: ShadingType.CLEAR,
            fill: normalizeColor(mark.attrs.color),
          };
        }
        break;
    }
  }

  return options;
}

function linkFromMarks(marks: any[], baseUrl?: string): string | undefined {
  const href = marks.find((mark) => mark?.type === 'link')?.attrs?.href;
  if (!href) return undefined;
  if (!href.startsWith('/') || !baseUrl) return href;
  return `${baseUrl.replace(/\/$/, '')}${href}`;
}

function normalizeColor(color: string): string {
  const hex = color.trim().replace('#', '');
  return /^[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : '000000';
}

function alignmentOf(node: any) {
  switch (node?.attrs?.textAlign ?? node?.attrs?.align) {
    case 'center':
      return AlignmentType.CENTER;
    case 'right':
      return AlignmentType.RIGHT;
    case 'justify':
      return AlignmentType.JUSTIFIED;
    default:
      return undefined;
  }
}

function collectText(node: any): string {
  if (node?.type === 'text') return node.text ?? '';
  if (!node?.content) return '';
  return node.content.map(collectText).join('');
}

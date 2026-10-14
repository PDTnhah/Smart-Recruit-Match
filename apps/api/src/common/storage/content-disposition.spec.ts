import { contentDisposition } from './content-disposition.js';

describe('GĐ1: download file name header (US-1.5 AC-9)', () => {
  it('GĐ1: keeps a Vietnamese name in filename* and an ASCII fallback in filename', () => {
    expect(contentDisposition('Mô tả công việc.pdf')).toBe(
      `inline; filename="Mo ta cong viec.pdf"; filename*=UTF-8''M%C3%B4%20t%E1%BA%A3%20c%C3%B4ng%20vi%E1%BB%87c.pdf`,
    );
  });

  it("GĐ1: percent-encodes ' ( ) * which RFC 5987 does not allow in filename*", () => {
    const header = contentDisposition("JD's (bản 2)*.docx");
    expect(header).toContain(`filename*=UTF-8''JD%27s%20%28b%E1%BA%A3n%202%29%2A.docx`);
    expect(header.split("UTF-8''")[1]).not.toMatch(/['()*]/);
  });

  it('GĐ1: quotes and backslashes cannot break out of the quoted fallback', () => {
    expect(contentDisposition('a"b\\c.pdf')).toContain('filename="a_b_c.pdf"');
  });

  it('GĐ1: a name with no ASCII letters still has a fallback', () => {
    expect(contentDisposition('đề.pdf')).toMatch(/filename="(.+)"/);
    expect(contentDisposition('文件')).toContain('filename="file"');
  });
});

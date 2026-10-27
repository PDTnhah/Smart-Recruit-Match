import { fileId } from '@srm/shared';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useCallback, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchFileUrl } from '@/shared/files/api';
import { ViewFileButton } from '@/shared/files/view-file-button';

// Set in the module that renders react-pdf, or its default may win (react-pdf README).
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

/** Canvases of a CV stay small on phones with a pixel ratio of 3. */
const MAX_PIXEL_RATIO = 2;

/** Width of the element, followed as it resizes (a tab shown, a phone rotated). */
function useWidth() {
  const [width, setWidth] = useState(0);
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry?.contentRect.width ?? 0)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function OpenFile({ cvId, fileName }: { cvId: number; fileName: string }) {
  return <ViewFileButton fileId={fileId('cv', cvId)} label={`Mở file: ${fileName}`} />;
}

function Unavailable({ cvId, fileName, title }: { cvId: number; fileName: string; title: string }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileText />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>Mở file CV ở thẻ mới để đối chiếu khi sửa hồ sơ.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <OpenFile cvId={cvId} fileName={fileName} />
      </EmptyContent>
    </Empty>
  );
}

const pageSkeleton = <Skeleton className="aspect-[210/297] w-full" />;

/**
 * The CV file next to the profile (US-2.6 AC-1), through a 5-minute presigned URL (CONTEXT D28).
 * A PDF shows page by page at the width of its column; a DOCX, or a PDF that does not load (a URL
 * from another origin in development), offers the file in a new tab instead.
 */
export function CvViewer({ cvId, fileName }: { cvId: number; fileName: string }) {
  const isPdf = fileName.toLowerCase().endsWith('.pdf');
  const { ref, width } = useWidth();
  const [pages, setPages] = useState(0);
  const [failed, setFailed] = useState(false);
  // Read once per mount and dropped on unmount: a refetch would reload the PDF, and the URL expires.
  const url = useQuery({
    queryKey: ['files', fileId('cv', cvId), 'url'],
    queryFn: () => fetchFileUrl(fileId('cv', cvId)),
    enabled: isPdf,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  if (!isPdf) return <Unavailable cvId={cvId} fileName={fileName} title="File DOCX không xem trước được ở đây" />;
  if (url.isError || failed) return <Unavailable cvId={cvId} fileName={fileName} title="Không hiển thị được file CV" />;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div ref={ref} className="flex min-w-0 flex-col gap-4">
        {url.data && width > 0 ? (
          <Document
            file={url.data}
            onLoadSuccess={({ numPages }) => setPages(numPages)}
            onLoadError={() => setFailed(true)}
            loading={pageSkeleton}
            className="flex flex-col gap-4"
          >
            {Array.from({ length: pages }, (_, index) => (
              <Page
                key={index}
                pageNumber={index + 1}
                width={width}
                devicePixelRatio={Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio)}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                loading={pageSkeleton}
                className="overflow-hidden rounded-lg border"
              />
            ))}
          </Document>
        ) : (
          pageSkeleton
        )}
      </div>
      <div className="min-w-0">
        <OpenFile cvId={cvId} fileName={fileName} />
      </div>
    </div>
  );
}

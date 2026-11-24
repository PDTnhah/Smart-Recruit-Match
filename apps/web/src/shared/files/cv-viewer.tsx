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

interface CvViewerProps {
  /** `cv:{id}` for the student's own version (US-2.6), `nomination:{id}` for HR (US-5.3). */
  fileId: string;
  fileName: string;
  /** Why to open the file in a new tab when it cannot show here. */
  hint: string;
}

function OpenFile({ fileId, fileName }: Pick<CvViewerProps, 'fileId' | 'fileName'>) {
  return <ViewFileButton fileId={fileId} label={`Mở file: ${fileName}`} />;
}

function Unavailable({ fileId, fileName, hint, title }: CvViewerProps & { title: string }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileText />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{hint}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <OpenFile fileId={fileId} fileName={fileName} />
      </EmptyContent>
    </Empty>
  );
}

const pageSkeleton = <Skeleton className="aspect-[210/297] w-full" />;

/**
 * A CV file through a 5-minute presigned URL (CONTEXT D28): next to the profile the student reviews
 * (US-2.6 AC-1), in the nomination HR reads (US-5.3 AC-12). A PDF shows page by page at the width of
 * its column; a DOCX, or a PDF that does not load (a URL from another origin in development), offers
 * the file in a new tab instead.
 */
export function CvViewer(props: CvViewerProps) {
  const { fileId, fileName } = props;
  const isPdf = fileName.toLowerCase().endsWith('.pdf');
  const { ref, width } = useWidth();
  const [pages, setPages] = useState(0);
  const [failed, setFailed] = useState(false);
  // Read once per mount and dropped on unmount: a refetch would reload the PDF, and the URL expires.
  const url = useQuery({
    queryKey: ['files', fileId, 'url'],
    queryFn: () => fetchFileUrl(fileId),
    enabled: isPdf,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  if (!isPdf) return <Unavailable {...props} title="File DOCX không xem trước được ở đây" />;
  if (url.isError || failed) return <Unavailable {...props} title="Không hiển thị được file CV" />;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div ref={ref} className="flex min-w-0 flex-col gap-4">
        {url.data && width > 0 ? (
          // react-pdf 11 suspends and throws to the nearest error boundary by default, which is the
          // route's: a PDF that fails to load would take the whole page down. Without Suspense, the
          // loading and onLoadError props below apply, and Pages inherit the setting.
          <Document
            suspense={false}
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
        <OpenFile fileId={fileId} fileName={fileName} />
      </div>
    </div>
  );
}

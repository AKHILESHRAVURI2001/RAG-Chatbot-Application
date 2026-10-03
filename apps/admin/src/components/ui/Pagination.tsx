import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
  className?: string;
}

export function Pagination({ currentPage, totalPages, onPageChange, totalItems, pageSize, className = '' }: PaginationProps) {
  if (totalPages <= 1 && !totalItems) return null;

  const lastPage = Math.max(1, totalPages);
  const startItem = totalItems && pageSize ? (currentPage - 1) * pageSize + 1 : undefined;
  const endItem = totalItems && pageSize ? Math.min(currentPage * pageSize, totalItems) : undefined;

  return (
    <nav className={`pagination ${className}`.trim()} aria-label="Pagination">
      <div className="pagination-info muted">
        {startItem && endItem && totalItems ? (
          <>
            Showing <strong>{startItem}</strong> to <strong>{endItem}</strong> of <strong>{totalItems}</strong> items
          </>
        ) : (
          <>
            Page <strong>{currentPage}</strong> of <strong>{lastPage}</strong>
          </>
        )}
      </div>

      <div className="pagination-controls">
        <button type="button" className="btn-secondary btn-tiny" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} aria-label="Previous page">
          <FiChevronLeft aria-hidden /> Previous
        </button>
        <span className="pagination-current" aria-current="page">
          {currentPage} / {lastPage}
        </span>
        <button type="button" className="btn-secondary btn-tiny" disabled={currentPage >= lastPage} onClick={() => onPageChange(currentPage + 1)} aria-label="Next page">
          Next <FiChevronRight aria-hidden />
        </button>
      </div>
    </nav>
  );
}

export default Pagination;

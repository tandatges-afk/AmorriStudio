import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../privacy/privacy.module.css';

export const metadata: Metadata = {
  title: 'Amorri Studio Backup | Sao lưu dữ liệu nội bộ',
  description: 'Giới thiệu công cụ sao lưu nội bộ Amorri Studio, quyền Google Drive và chính sách bảo mật.',
  alternates: { canonical: 'https://amorri.io.vn/backup' },
};

export default function BackupHomePage() {
  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.header}>
          <Link href="/backup" className={styles.brand}>AMORRI <span>STUDIO</span></Link>
          <nav aria-label="Điều hướng Backup"><Link href="/backup" aria-current="page">Giới thiệu Backup</Link><Link href="/privacy">Chính sách bảo mật</Link></nav>
        </header>
        <article className={styles.document}>
          <p className={styles.eyebrow}>CÔNG CỤ NỘI BỘ · SAO LƯU DỮ LIỆU</p>
          <h1>Amorri Studio Backup</h1>
          <p className={styles.lead}>Amorri Studio Backup là công cụ nội bộ của Amorri Studio hỗ trợ tạo bản sao dữ liệu vận hành, lịch hẹn, ảnh Concept và tệp video để phục hồi khi xảy ra sự cố.</p>
          <section><h2>Ứng dụng hoạt động thế nào?</h2><p>Dữ liệu từ máy chủ Amorri Studio được đưa vào bản sao lưu. Công cụ sử dụng Rclone Crypt mã hóa nội dung và tên tệp trước khi chuyển lên kho lưu trữ Google Drive do người quản trị cấp quyền.</p></section>
          <section><h2>Vì sao ứng dụng yêu cầu quyền Google Drive?</h2><p>Quyền <code>drive.file</code> được dùng để tạo, đọc và kiểm tra các tệp backup mà ứng dụng được phép truy cập. Amorri Studio Backup không được thiết kế để đọc các tệp Google Drive không liên quan, bán dữ liệu hoặc sử dụng dữ liệu cho quảng cáo.</p></section>
          <section><h2>Ai sử dụng công cụ?</h2><p>Đây là công cụ sao lưu dành cho người quản trị được Amorri Studio ủy quyền. Người dùng không cần cung cấp quyền Google Drive để xem trang giới thiệu hoặc đọc chính sách bảo mật.</p></section>
          <section><h2>Thông tin và quyền riêng tư</h2><p>Vui lòng đọc <Link href="/privacy">Chính sách bảo mật Amorri Studio Backup</Link> để biết loại dữ liệu được xử lý, cách sử dụng Google Drive, mã hóa, quyền yêu cầu chỉnh sửa/xóa và cách liên hệ.</p></section>
        </article>
        <footer className={styles.footer}>© Amorri Studio · <Link href="/privacy">Chính sách bảo mật</Link> · <Link href="/">Hệ thống quản lý Amorri</Link></footer>
      </div>
    </main>
  );
}

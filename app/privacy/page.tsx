import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './privacy.module.css';
import { PRIVACY_CONTACT_EMAIL, PRIVACY_UPDATED_AT } from './config';

export const metadata: Metadata = {
  title: 'Chính sách bảo mật | Amorri Studio Backup',
  description: 'Chính sách xử lý dữ liệu, quyền Google Drive, mã hóa, lưu giữ và xóa dữ liệu của Amorri Studio Backup.',
  alternates: { canonical: 'https://amorri.io.vn/privacy' },
};

const isConfigured = PRIVACY_CONTACT_EMAIL.includes('@');

export default function PrivacyPage() {
  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.header}>
          <Link href="/backup" className={styles.brand}>AMORRI <span>STUDIO</span></Link>
          <nav aria-label="Điều hướng chính sách">
            <Link href="/backup">Giới thiệu Backup</Link>
            <Link href="/privacy" aria-current="page">Chính sách bảo mật</Link>
          </nav>
        </header>
        <article className={styles.document}>
          <p className={styles.eyebrow}>MINH BẠCH DỮ LIỆU · AMORRI STUDIO BACKUP</p>
          <h1>Chính sách bảo mật</h1>
          <p className={styles.lead}>Chính sách này giải thích cách Amorri Studio và công cụ Amorri Studio Backup thu thập, sử dụng, lưu trữ, bảo vệ và xóa dữ liệu khi vận hành studio và sao lưu lên Google Drive.</p>
          <p className={styles.updated}>Cập nhật: {PRIVACY_UPDATED_AT}</p>

          <section aria-labelledby="who"><h2 id="who">1. Đơn vị vận hành và phạm vi áp dụng</h2>
            <p>Amorri Studio là đơn vị vận hành ứng dụng Amorri Studio và công cụ sao lưu nội bộ có tên <strong>Amorri Studio Backup</strong>. Chính sách áp dụng cho thông tin phát sinh trong hoạt động quản lý lịch hẹn, nhân sự, bàn giao ảnh/video và hệ thống sao lưu. Công cụ Backup dành cho người được Amorri Studio cấp quyền quản trị; không phải ứng dụng sao lưu dữ liệu cá nhân đại trà.</p>
          </section>

          <section aria-labelledby="data"><h2 id="data">2. Những loại dữ liệu được xử lý</h2>
            <ul>
              <li><strong>Dữ liệu vận hành studio:</strong> lịch hẹn, mã sự kiện, thông tin liên hệ khách hàng, công việc, phân công nhân sự và dữ liệu phục vụ quản lý.</li>
              <li><strong>Dữ liệu sản phẩm:</strong> ảnh Concept, video, tệp giao nhận và thông tin liên quan đến bộ ảnh/video theo từng lịch.</li>
              <li><strong>Dữ liệu kỹ thuật:</strong> thông tin vận hành bản sao lưu, thời điểm thực hiện, nhật ký lỗi và trạng thái kiểm tra khôi phục.</li>
              <li><strong>Dữ liệu Google Drive:</strong> các tệp và thư mục sao lưu do ứng dụng tạo hoặc đã được người sở hữu tài khoản cho phép ứng dụng truy cập trong phạm vi quyền Google đã cấp.</li>
            </ul>
            <p>Amorri Studio Backup không yêu cầu quyền đọc toàn bộ tệp Google Drive không liên quan đến chức năng sao lưu.</p>
          </section>

          <section aria-labelledby="google"><h2 id="google">3. Truy cập và sử dụng dữ liệu Google Drive</h2>
            <p>Amorri Studio Backup sử dụng Google Drive API thông qua OAuth 2.0, với quyền <code>https://www.googleapis.com/auth/drive.file</code>. Quyền này cho phép ứng dụng tạo, quản lý và truy cập những tệp phù hợp với phạm vi cấp quyền của Google, không đồng nghĩa với quyền đọc không giới hạn mọi tệp trong Drive.</p>
            <p>Ứng dụng dùng quyền này để tải các bản sao lưu được mã hóa từ máy chủ Amorri Studio lên tài khoản Google Drive do người quản trị chỉ định; liệt kê, kiểm tra và đọc lại các bản sao lưu đó khi cần xác minh hoặc khôi phục. Dữ liệu Google Drive chỉ được sử dụng cho hoạt động sao lưu, kiểm tra tính toàn vẹn và khôi phục, không dùng để quảng cáo, tạo hồ sơ tiếp thị hoặc bán dữ liệu.</p>
            <p>Amorri Studio không sử dụng dữ liệu người dùng Google Workspace API để phát triển, cải thiện hoặc huấn luyện các mô hình AI/ML tổng quát.</p>
          </section>

          <section aria-labelledby="security"><h2 id="security">4. Lưu trữ và bảo vệ dữ liệu</h2>
            <p>Trong quy trình sao lưu hiện tại, dữ liệu PostgreSQL và tệp ảnh/video được sao chép từ máy chủ Amorri Studio sang kho lưu trữ Google Drive qua Rclone. Kho backup sử dụng <strong>Rclone Crypt</strong> để mã hóa nội dung và tên tệp trước khi truyền lên Google Drive. Chỉ những người được giao quyền quản trị và có thông tin giải mã hợp lệ mới có thể mở nội dung sao lưu.</p>
            <p>Cấu hình OAuth, khóa truy cập và thông tin giải mã được quản lý tách khỏi mã nguồn công khai; quyền truy cập tệp cấu hình trên máy chủ được giới hạn cho tài khoản quản trị. Không nên gửi token, khóa hoặc bản backup cho người không có thẩm quyền.</p>
            <p>Không có biện pháp kỹ thuật nào bảo đảm an toàn tuyệt đối. Amorri Studio thực hiện các bước phù hợp để hạn chế truy cập trái phép và điều tra, khắc phục sự cố khi được phát hiện.</p>
          </section>

          <section aria-labelledby="share"><h2 id="share">5. Chia sẻ dữ liệu và bên cung cấp dịch vụ</h2>
            <p>Amorri Studio không bán dữ liệu khách hàng hoặc dữ liệu Google Drive. Dữ liệu chỉ được tiếp cận bởi nhân sự có quyền phù hợp và các nhà cung cấp hạ tầng cần thiết để vận hành dịch vụ, như dịch vụ máy chủ và Google Drive. Việc chia sẻ trong nội bộ và với bên cung cấp hạ tầng phải phục vụ hoạt động đã nêu trong chính sách, bảo vệ dữ liệu hoặc đáp ứng yêu cầu hợp pháp.</p>
          </section>

          <section aria-labelledby="retention"><h2 id="retention">6. Thời hạn lưu trữ và xóa dữ liệu</h2>
            <p>Các bản sao lưu hiện được tạo theo từng lần chạy. <strong>Cơ chế xóa tự động theo số ngày chưa được kích hoạt</strong>; vì vậy bản sao có thể được giữ cho tới khi người quản trị được ủy quyền xóa theo chính sách vận hành hoặc theo yêu cầu hợp lệ, trừ trường hợp cần tiếp tục lưu trữ theo nghĩa vụ pháp lý hoặc giải quyết tranh chấp.</p>
            <p>Việc xóa dữ liệu trong hệ thống đang hoạt động không nhất thiết xóa ngay dữ liệu đã nằm trong snapshot sao lưu trước đó. Khi tiếp nhận yêu cầu xóa hợp lệ, Amorri Studio sẽ kiểm tra phạm vi dữ liệu liên quan và xử lý trong hệ thống chính, các bản sao lưu có thể truy xuất được và những nơi lưu giữ áp dụng, theo nghĩa vụ pháp luật và yêu cầu bảo đảm khôi phục.</p>
            <p>Người dùng Google có thể thu hồi quyền truy cập của ứng dụng trong phần quản lý quyền kết nối của Tài khoản Google. Thu hồi quyền truy cập không tự động xóa các tệp backup đã tạo trong Google Drive; chủ tài khoản có thể yêu cầu Amorri Studio hỗ trợ hoặc xóa các tệp đó trực tiếp theo quyền sở hữu.</p>
          </section>

          <section aria-labelledby="rights"><h2 id="rights">7. Quyền và yêu cầu của người có dữ liệu</h2>
            <p>Khách hàng, nhân viên và người dùng có thể liên hệ để yêu cầu biết thông tin về dữ liệu cá nhân của mình, đề nghị chỉnh sửa, hạn chế xử lý hoặc xóa trong phạm vi phù hợp với quy định và thỏa thuận liên quan. Vì dữ liệu ảnh/video có thể liên quan nhiều người, Amorri Studio có thể cần xác minh quyền yêu cầu trước khi thực hiện.</p>
          </section>

          <section aria-labelledby="changes"><h2 id="changes">8. Thay đổi chính sách</h2>
            <p>Chính sách có thể được cập nhật khi chức năng sao lưu hoặc cách xử lý dữ liệu thay đổi. Phiên bản mới sẽ được đăng tại <Link href="/privacy">https://amorri.io.vn/privacy</Link> cùng ngày cập nhật. Nếu có thay đổi đáng kể trong việc sử dụng dữ liệu Google, Amorri Studio sẽ cập nhật thông báo liên quan trước khi áp dụng.</p>
          </section>

          <section aria-labelledby="contact" className={styles.contact}><h2 id="contact">9. Liên hệ về quyền riêng tư</h2>
            <p><strong>Đơn vị phụ trách:</strong> Amorri Studio — Amorri Studio Backup</p>
            {isConfigured ? (
              <p><strong>Email liên hệ:</strong> <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>{PRIVACY_CONTACT_EMAIL}</a></p>
            ) : (
              <p className={styles.needsSetup}><strong>CẦN BỔ SUNG:</strong> Email hỗ trợ công khai trước khi đưa trang này lên production. Xem app/privacy/config.ts.</p>
            )}
            <p>Website: <a href="https://amorri.io.vn">https://amorri.io.vn</a></p>
          </section>
        </article>
        <footer className={styles.footer}>© Amorri Studio · <Link href="/backup">Amorri Studio Backup</Link> · <Link href="/privacy">Chính sách bảo mật</Link></footer>
      </div>
    </main>
  );
}

import { LoginForm } from "./login-form";
import styles from "./login.module.css";

export default function LoginPage() {
  return (
    <div className={styles.wrapper}>
      <LoginForm />
    </div>
  );
}

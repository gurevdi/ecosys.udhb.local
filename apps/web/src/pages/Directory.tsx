import { Navigate } from "react-router-dom";

/** Редirect: каталог AD перенесён в раздел «Пользователи» */
export default function Directory() {
  return <Navigate to="/users?tab=catalog" replace />;
}

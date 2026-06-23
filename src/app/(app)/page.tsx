import { redirect } from "next/navigation";

// 루트(/)는 알아보기(/guide)를 첫 화면으로 보여준다. 대시보드는 /dashboard.
export default function Home() {
  redirect("/guide");
}

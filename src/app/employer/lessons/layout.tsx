import { StudentDirectoryProvider } from "@/components/student-directory-provider";

export default function LessonsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StudentDirectoryProvider>{children}</StudentDirectoryProvider>;
}

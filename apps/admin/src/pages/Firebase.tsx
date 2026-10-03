import { useEffect, useState } from 'react';
import { FiLock, FiCloud, FiFilter, FiList, FiDatabase } from 'react-icons/fi';
import { api } from '../lib/api';
import FirebaseCredentialCard from '../components/FirebaseCredentialCard';
import FirebaseReportsCard from '../components/FirebaseReportsCard';
import Card from '../components/ui/Card';
import CategoryNav, { type Category } from '../components/ui/CategoryNav';
import PageHeader from '../components/ui/PageHeader';

export default function Firebase() {
  const [category, setCategory] = useState('configuration');
  const [tab, setTab] = useState('credential');
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    api.getSettings().then((s) => setEnabled(s.firebase.enabled)).catch(() => {});
  }, []);

  const CATEGORIES: Category[] = [
    {
      id: 'configuration', label: 'Configuration', icon: <FiLock />,
      tabs: [{ id: 'credential', label: 'Credential', icon: <FiLock /> }],
    },
    {
      id: 'reports', label: 'Reports', icon: <FiCloud />,
      tabs: [
        { id: 'filter', label: 'Filter', icon: <FiFilter /> },
        { id: 'mirrored', label: 'Mirrored', icon: <FiCloud /> },
        { id: 'cache', label: 'Semantic Cache', icon: <FiDatabase /> },
        { id: 'conversations', label: 'Conversations', icon: <FiList /> },
      ],
    },
  ];

  function selectCategory(id: string) {
    setCategory(id);
    setTab(CATEGORIES.find((c) => c.id === id)!.tabs[0].id);
  }

  return (
    <div>
      <PageHeader
        title="Firebase"
        description="Manage your Google Cloud Firestore integration, real-time message mirroring, and semantic cache analytics."
      />
      <CategoryNav categories={CATEGORIES} category={category} tab={tab} onSelectCategory={selectCategory} onSelectTab={setTab}>
        {tab === 'credential' && <FirebaseCredentialCard />}
        {category === 'reports' && !enabled && (
          <Card>
            <p className="muted">Firebase logging is currently disabled — turn it on in Configuration tab to see reports here.</p>
          </Card>
        )}
        {category === 'reports' && enabled && (
          <>
            {tab === 'filter' && <FirebaseReportsCard section="filter" />}
            {tab === 'mirrored' && <FirebaseReportsCard section="mirrored" />}
            {tab === 'cache' && <FirebaseReportsCard section="cache" />}
            {tab === 'conversations' && <FirebaseReportsCard section="conversations" />}
          </>
        )}
      </CategoryNav>
    </div>
  );
}
